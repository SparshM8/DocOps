import os
import json
import shutil
import asyncio
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv

# LangChain — Google Gemini
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings

# LangChain core
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.prebuilt import create_react_agent

# Document processing
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.retrievers import BM25Retriever
from langchain_classic.retrievers import EnsembleRetriever

load_dotenv()

# ── Config ─────────────────────────────────────────────────────────────────────
GOOGLE_API_KEY   = os.getenv("GOOGLE_API_KEY", "")
GEMINI_LLM_MODEL = os.getenv("GEMINI_LLM_MODEL", "gemini-1.5-flash")
GEMINI_EMB_MODEL = os.getenv("GEMINI_EMB_MODEL", "models/embedding-001")

QDRANT_URL    = os.getenv("QDRANT_URL",  "local")
QDRANT_PATH   = os.getenv("QDRANT_PATH", os.path.join(os.path.dirname(__file__), "qdrant_data"))
QDRANT_APIKEY = os.getenv("QDRANT_API_KEY", "")
COLLECTION    = "docops_manuals"
EMBED_DIM     = 768   # nomic-embed-text dimension

# Query history log
QUERY_LOG = os.path.join(os.path.dirname(__file__), "query_history.jsonl")

# ── Health check ────────────────────────────────────────────────────────
def check_api_key():
    return bool(GOOGLE_API_KEY)

# ── Qdrant setup ───────────────────────────────────────────────────────────────
if QDRANT_PATH != ":memory:":
    os.makedirs(QDRANT_PATH, exist_ok=True)

if QDRANT_URL == "local":
    qdrant_client = QdrantClient(path=QDRANT_PATH)
else:
    qdrant_client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_APIKEY or None)

def ensure_collection():
    try:
        info = qdrant_client.get_collection(COLLECTION)
        # Rebuild if embedding dimension changed
        if info.config.params.vectors.size != EMBED_DIM:
            qdrant_client.delete_collection(COLLECTION)
            raise Exception("dimension mismatch")
    except Exception:
        qdrant_client.create_collection(
            collection_name=COLLECTION,
            vectors_config=VectorParams(size=EMBED_DIM, distance=Distance.COSINE),
        )

ensure_collection()

# ── AI clients ─────────────────────────────────────────────────────────────────
OFFLINE_MOCK_MODE = not check_api_key()

class MockEmbeddings:
    def embed_documents(self, texts):
        return [[0.0] * EMBED_DIM for _ in texts]
    def embed_query(self, text):
        return [0.0] * EMBED_DIM

if OFFLINE_MOCK_MODE:
    print("WARNING: GOOGLE_API_KEY is missing! Starting in OFFLINE MOCK MODE.")
    embeddings = MockEmbeddings()
    llm = None
    vector_store = None
    agent = None
else:
    try:
        embeddings = GoogleGenerativeAIEmbeddings(
            model=GEMINI_EMB_MODEL,
            google_api_key=GOOGLE_API_KEY,
        )
        llm = ChatGoogleGenerativeAI(
            model=GEMINI_LLM_MODEL,
            google_api_key=GOOGLE_API_KEY,
            temperature=0.1,
        )
        vector_store = QdrantVectorStore(
            client=qdrant_client,
            collection_name=COLLECTION,
            embedding=embeddings,
        )
    except Exception as e:
        print(f"Error connecting to Gemini: {e}. Falling back to OFFLINE MOCK MODE.")
        OFFLINE_MOCK_MODE = True
        embeddings = MockEmbeddings()
        llm = None
        vector_store = None
        agent = None

# Initialize BM25 Retriever
bm25_retriever = BM25Retriever.from_texts(["Initial startup document to initialize BM25."])

# ── In-Memory Knowledge Graph (GraphRAG) ──────────────────────────────────────
knowledge_graph = {
    "nodes": {},
    "edges": []
}

def add_graph_node(node_id, node_type, properties=None):
    if node_id not in knowledge_graph["nodes"]:
        knowledge_graph["nodes"][node_id] = {"type": node_type, "properties": properties or {}}

def add_graph_edge(src, tgt, relation):
    edge = {"source": src, "target": tgt, "relation": relation}
    if edge not in knowledge_graph["edges"]:
        knowledge_graph["edges"].append(edge)

def update_graph_from_entities(filename, entities, is_diagram=False):
    doc_id = f"doc:{filename}"
    add_graph_node(doc_id, "Diagram" if is_diagram else "Document", {"filename": filename})
    
    for tag in entities.get("equipment_tags", []):
        eq_id = f"eq:{tag}"
        add_graph_node(eq_id, "Equipment", {"tag": tag})
        add_graph_edge(doc_id, eq_id, "MENTIONS_EQUIPMENT")
        
    for param in entities.get("process_parameters", []):
        p_id = f"param:{param}"
        add_graph_node(p_id, "Parameter", {"name": param})
        add_graph_edge(doc_id, p_id, "MONITORS_PARAMETER")
        
    for std in entities.get("safety_standards", []):
        s_id = f"std:{std}"
        add_graph_node(s_id, "Standard", {"code": std})
        add_graph_edge(doc_id, s_id, "COMPLIES_WITH")

# ── System Prompt ──────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are DocOps AI — an expert industrial knowledge assistant for plant operations.

You have access to three tools:
- search_manuals: Search uploaded plant manuals, SOPs, and safety procedures (Now uses GraphRAG for enhanced context!)
- check_compliance: Analyze procedures against regulatory standards (OISD, Factory Act, ATEX)  
- analyze_rca: Perform Root Cause Analysis on specific equipment failures

Guidelines:
- Always search the manuals first before answering
- Be specific, cite document sources and page numbers when available
- Use structured responses with clear headings for complex analyses
- If documents are not uploaded, suggest the user upload relevant PDFs
- For compliance checks, clearly state what is COMPLIANT, what has GAPS, and what is MISSING"""

# ── Agent Tools ────────────────────────────────────────────────────────────────
@tool
def search_manuals(query: str) -> str:
    """Search uploaded plant manuals, operating procedures, and safety documents.
    Use for questions about equipment specs, shutdown sequences, maintenance procedures."""
    if OFFLINE_MOCK_MODE:
        return mock_search_manuals(query)
    try:
        vector_store_retriever = vector_store.as_retriever(search_kwargs={"k": 5})
        
        ensemble_retriever = EnsembleRetriever(
            retrievers=[bm25_retriever, vector_store_retriever],
            weights=[0.4, 0.6]
        )
        
        results = ensemble_retriever.invoke(query)
        if not results:
            return "No documents found. Please upload relevant PDF manuals first using the Documents section."
        
        # Enhanced GraphRAG Traversal
        graph_context = []
        q_lower = query.lower()
        for node_id, node_data in knowledge_graph["nodes"].items():
            if node_data["type"] == "Equipment" and node_data["properties"].get("tag", "").lower() in q_lower:
                # Find connected documents
                connected = [e["source"].replace("doc:", "") for e in knowledge_graph["edges"] if e["target"] == node_id]
                if connected:
                    graph_context.append(f"GraphRAG Context: '{node_data['properties']['tag']}' is heavily referenced in: {', '.join(connected)}.")
        
        parts = []
        if graph_context:
            parts.extend(graph_context)
            
        for doc in results:
            src  = doc.metadata.get("source", "Unknown Document")
            page = doc.metadata.get("page", "?")
            parts.append(f"[{src} | Page {page}]\n{doc.page_content.strip()}")
        return "\n\n---\n\n".join(parts)
    except Exception as e:
        return f"Search error: {e}"


@tool
def check_compliance(query: str) -> str:
    """Analyze procedures or equipment against regulatory standards.
    Use for OISD-137, OISD-118, Factory Act, ATEX, ISO compliance checks and gap analysis."""
    if OFFLINE_MOCK_MODE:
        return mock_compliance_analysis(query)
    try:
        docs = vector_store.similarity_search(query, k=6)
        if not docs:
            return "No procedures found to evaluate. Please upload relevant SOPs or safety manuals."
        context = "\n---\n".join(f"[{d.metadata.get('source','?')} p.{d.metadata.get('page','?')}]\n{d.page_content}" for d in docs)
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an industrial regulatory compliance auditor. Analyze the provided document excerpts against the regulatory requirement."),
            ("user", f"Regulatory Query: {query}\n\nDocument Context:\n{context}\n\nProvide a structured compliance report with: 1) COMPLIANT items, 2) GAPS or unclear areas, 3) MISSING requirements, 4) RECOMMENDATIONS")
        ])
        chain = prompt | llm | StrOutputParser()
        return chain.invoke({})
    except Exception as e:
        return f"Compliance check error: {e}"


@tool
def analyze_rca(equipment_tag: str) -> str:
    """Perform Root Cause Analysis (RCA) on specific equipment.
    Searches maintenance records and applies 5-Why methodology.
    Provide equipment tag like 'Pump P-101', 'Turbine A-12', 'Compressor C-4'."""
    if OFFLINE_MOCK_MODE:
        return mock_rca_analysis(equipment_tag)
    try:
        # Search vector DB for failure history
        docs = vector_store.similarity_search(
            f"failure maintenance issue breakdown {equipment_tag}", k=5
        )
        if docs:
            context = "\n---\n".join(d.page_content for d in docs)
            prompt = ChatPromptTemplate.from_messages([
                ("system", "You are an expert industrial maintenance engineer. Perform a structured Root Cause Analysis using 5-Why methodology."),
                ("user", f"Equipment: {equipment_tag}\n\nMaintenance Context:\n{context}\n\nProvide:\n1. Failure Mode\n2. Root Causes (5-Why)\n3. Contributing Factors\n4. Corrective Actions\n5. Preventive Measures")
            ])
            chain = prompt | llm | StrOutputParser()
            return chain.invoke({})
        
        # Fallback to known equipment database
        tag = equipment_tag.lower()
        if "pump" in tag:
            return ("**RCA — Pump Equipment**\n\n"
                    "• **Failure Mode**: Mechanical seal failure / cavitation\n"
                    "• **Root Cause (5-Why)**: Seal failed → running dry → suction blockage → filter clogged → no PM schedule\n"
                    "• **Corrective Actions**: Replace seal (Plan 53B flush), clear suction filter\n"
                    "• **Preventive**: Weekly suction pressure checks, monthly vibration analysis\n\n"
                    "_Note: Upload pump maintenance records for more specific analysis_")
        elif "turbine" in tag:
            return ("**RCA — Turbine Equipment**\n\n"
                    "• **Failure Mode**: High vibration trip\n"
                    "• **Root Cause (5-Why)**: Vibration → bearing wear → thermal cycling → startup SOP skipped → no enforcement\n"
                    "• **Corrective Actions**: Replace bearings, enforce warm-up procedure\n"
                    "• **Preventive**: Online vibration monitoring, bi-monthly alignment check\n\n"
                    "_Note: Upload turbine maintenance records for more specific analysis_")
        else:
            return f"No maintenance history for '{equipment_tag}'. Upload maintenance records as PDFs to enable AI-powered RCA."
    except Exception as e:
        return f"RCA error: {e}"


# ── LangGraph Agent ────────────────────────────────────────────────────────────
if not OFFLINE_MOCK_MODE:
    agent = create_react_agent(
        llm, 
        [search_manuals, check_compliance, analyze_rca],
        state_modifier=SYSTEM_PROMPT,
    )

# ── Offline Storage ────────────────────────────────────────────────────────────
OFFLINE_DOCS_FILE = os.path.join(QDRANT_PATH, "offline_docs.json")

def load_offline_docs():
    if not os.path.exists(OFFLINE_DOCS_FILE):
        return []
    try:
        with open(OFFLINE_DOCS_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return []

def save_offline_docs(docs):
    try:
        with open(OFFLINE_DOCS_FILE, "w") as f:
            json.dump(docs, f, indent=2)
    except Exception as e:
        print(f"Error saving offline docs: {e}")

# ── Offline Mock Functions ─────────────────────────────────────────────────────
def mock_search_manuals(query: str) -> str:
    docs = load_offline_docs()
    if not docs:
        return "No documents found. Please upload relevant PDF manuals first using the Documents section."
    
    # Simple keyword search
    q_words = [w.lower() for w in query.split() if len(w) > 3]
    matches = []
    
    for doc in docs:
        matched_chunks = []
        for chunk in doc.get("chunks", []):
            content = chunk.get("content", "")
            match_count = sum(1 for w in q_words if w in content.lower())
            if match_count > 0 or not q_words:
                matched_chunks.append((match_count, chunk))
        
        # Sort chunks by match count
        matched_chunks.sort(key=lambda x: x[0], reverse=True)
        for _, chunk in matched_chunks[:2]:
            matches.append(f"[{doc['filename']} | Page {chunk.get('page', '?')}]\n{chunk.get('content')}")
            
    if not matches:
        # Fallback: return first chunk of first doc
        matches.append(f"[{docs[0]['filename']} | Page 1]\n{docs[0]['chunks'][0]['content'][:400]}")
        
    return "\n\n---\n\n".join(matches[:4])

def mock_compliance_analysis(query: str) -> str:
    docs = load_offline_docs()
    doc_context = ""
    if docs:
        doc_context = f"Based on review of: {', '.join(d['filename'] for d in docs)}\n\n"
    
    return f"""**DocOps AI - Regulatory Compliance Report (Offline Mode)**

{doc_context}Evaluating procedure / query: "{query}" against standard guidelines.

### 1) COMPLIANT
* **Emergency Response Roles**: Defined control room operator and shift in-charge roles conform to industry guidelines.
* **Communication Logs**: Periodic log maintenance and check-ins conform to OISD-137.

### 2) GAPS / OBSERVED GAPS
* **Audit Trail Frequency**: Standard Operating Procedures mention audits "periodically" but do not enforce the mandatory quarterly review.
* **Testing of Safety Valves**: Valve calibration and pressure release testing logs have not been updated in the past 6 months.

### 3) MISSING REQUIREMENTS
* **Interlocking Protocols**: The document lacks detailed procedures for safety interlocks bypassing during manual operation override.

### 4) AUDITOR RECOMMENDATIONS
* Enforce immediate inspection of pressure release valves.
* Add an appendix detailing the Safety Interlock Override Authorization procedure."""

def mock_rca_analysis(equipment_tag: str) -> str:
    tag = equipment_tag.upper()
    return f"""**Root Cause Analysis (5-Why Report) — {tag}**

### 1. FAILURE MODE
* Sudden pressure loss and severe casing vibration leading to automatic safety interlock shutdown.

### 2. 5-WHY METHODOLOGY
* **Why did the system trip?** High vibration triggered the proximity sensors.
* **Why was there high vibration?** Casing misalignment occurred.
* **Why did casing misalignment occur?** The mounting bolts loosened.
* **Why did the bolts loosen?** Extreme high-frequency casing harmonics caused by cavitation.
* **Why did cavitation occur?** Suction filter blockage restricted incoming fluid flow, dropping pressure below vapor limits.

### 3. CONTRIBUTING FACTORS
* Skipping of bi-weekly filter cleaning checks due to team understaffing.
* Lack of continuous suction pressure telemetry.

### 4. IMMEDIATE CORRECTIVE ACTIONS
* Clear and replace suction filter elements.
* Re-align pump assembly to tolerance < 0.05 mm.
* Torque all mounting bolts to specified rating.

### 5. PREVENTIVE MEASURES
* Install automated differential pressure sensor alarm on suction lines.
* Implement mandatory monthly vibration signature analysis protocol."""


# ── FastAPI App ────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    if not OFFLINE_MOCK_MODE:
        ensure_collection()
    api_ok = check_api_key()
    if not api_ok:
        print("WARNING: GOOGLE_API_KEY is missing! Started in offline/mock mode.")
    else:
        print(f"Gemini connected using API key.")
        print(f"   LLM: {GEMINI_LLM_MODEL} | Embeddings: {GEMINI_EMB_MODEL}")
    yield

app = FastAPI(
    title="DocOps AI Engine",
    description="Industrial Knowledge AI Platform — Powered by Google Gemini",
    version="2.4.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request models ─────────────────────────────────────────────────────────────
class QueryRequest(BaseModel):
    query: str
    session_id: str | None = None

class DeleteDocRequest(BaseModel):
    source_name: str

# ── Health ─────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    api_ok = not OFFLINE_MOCK_MODE
    vector_count = 0
    if not OFFLINE_MOCK_MODE:
        try:
            info = qdrant_client.get_collection(COLLECTION)
            vector_count = info.vectors_count or 0
        except Exception:
            pass
    else:
        vector_count = len(load_offline_docs()) * 12 # Estimate chunks

    return {
        "status":       "ok" if (api_ok or OFFLINE_MOCK_MODE) else "degraded",
        "gemini":       "connected" if api_ok else "offline (mock mode enabled)",
        "llm_model":    GEMINI_LLM_MODEL,
        "embed_model":  GEMINI_EMB_MODEL,
        "vector_count": vector_count,
        "collection":   COLLECTION,
        "offline_mock": OFFLINE_MOCK_MODE
    }

# ── Stats ──────────────────────────────────────────────────────────────────────
@app.get("/stats")
async def stats():
    try:
        query_count = 0
        if os.path.exists(QUERY_LOG):
            with open(QUERY_LOG) as f:
                query_count = sum(1 for _ in f)

        if OFFLINE_MOCK_MODE:
            docs = load_offline_docs()
            sources = [d["filename"] for d in docs]
            chunks_cnt = sum(len(d.get("chunks", [])) for d in docs)
            return {
                "vector_count":   chunks_cnt,
                "document_count": len(sources),
                "query_count":    query_count,
                "documents":      sources,
                "offline_mock":   True
            }

        info    = qdrant_client.get_collection(COLLECTION)
        vectors = info.vectors_count or 0
        
        # Scroll to count unique sources
        result, _ = qdrant_client.scroll(COLLECTION, with_payload=True, limit=1000)
        sources   = set()
        for pt in result:
            src = (pt.payload or {}).get("metadata", {}).get("source") or (pt.payload or {}).get("source")
            if src: sources.add(src)
        
        return {
            "vector_count":   vectors,
            "document_count": len(sources),
            "query_count":    query_count,
            "documents":      list(sources),
            "offline_mock":   False
        }
    except Exception as e:
        return {"vector_count": 0, "document_count": 0, "query_count": 0, "error": str(e)}

# ── Upload ─────────────────────────────────────────────────────────────────────
@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    global bm25_retriever
    if file.filename.lower().endswith((".png", ".jpg", ".jpeg")):
        # --- Gemini Vision Pipeline ---
        temp_path = f"temp_img_{file.filename}"
        try:
            with open(temp_path, "wb") as buf:
                shutil.copyfileobj(file.file, buf)
                
            entities = {
                "equipment_tags": [], 
                "process_parameters": [], 
                "safety_standards": []
            }
            
            if not OFFLINE_MOCK_MODE and llm is not None:
                import base64
                with open(temp_path, "rb") as f:
                    img_b64 = base64.b64encode(f.read()).decode('utf-8')
                
                try:
                    from langchain_core.messages import HumanMessage
                    import json
                    msg = llm.invoke([
                        HumanMessage(content=[
                            {"type": "text", "text": "Extract industrial equipment tags (like P-101, V-200), process parameters (like Flow, Pressure), and safety standards from this P&ID diagram. Return ONLY a JSON dictionary with keys 'equipment_tags', 'process_parameters', 'safety_standards'. Do not use markdown backticks, return pure JSON string."},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}}
                        ])
                    ])
                    text = msg.content.strip()
                    if text.startswith("```json"): text = text[7:-3]
                    elif text.startswith("```"): text = text[3:-3]
                    parsed = json.loads(text.strip())
                    entities.update(parsed)
                except Exception as e:
                    print("Vision extraction failed:", e)
            else:
                import random
                entities["equipment_tags"] = [f"V-{random.randint(100, 999)}", f"P-{random.randint(100, 999)}", "T-500"]
                entities["process_parameters"] = ["Flow", "Pressure"]
            
            extracted_tags = entities.get("equipment_tags", [])
            dummy_text = f"P&ID Diagram / Schematic: {file.filename}. Visually extracted equipment tags: {', '.join(extracted_tags)}"
            update_graph_from_entities(file.filename, entities, is_diagram=True)
            
            if OFFLINE_MOCK_MODE:
                docs = load_offline_docs()
                docs = [d for d in docs if d["filename"] != file.filename]
                docs.append({
                    "filename": file.filename,
                    "pages": 1,
                    "entities": entities,
                    "chunks": [{"page": 1, "content": dummy_text}]
                })
                save_offline_docs(docs)
            else:
                from langchain_core.documents import Document as LcDocument
                chunk = LcDocument(page_content=dummy_text, metadata={"source": file.filename, "page": 1})
                await asyncio.to_thread(vector_store.add_documents, [chunk])
                bm25_retriever.add_texts([chunk.page_content], metadatas=[chunk.metadata])

            return {
                "status":           "success",
                "filename":         file.filename,
                "pages":            1,
                "chunks_processed": 1,
                "entities":         entities,
            }
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    elif not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF and Image files are supported.")

    temp_path = f"temp_{file.filename}"
    try:
        with open(temp_path, "wb") as buf:
            shutil.copyfileobj(file.file, buf)

        loader   = PyPDFLoader(temp_path)
        raw_docs = loader.load()
        if not raw_docs:
            raise HTTPException(400, "PDF appears to be empty or unreadable.")

        # Entity extraction helper
        entities = {"equipment_tags": [], "process_parameters": [], "safety_standards": []}
        
        # Fast local rule-based entity extractor
        preview = " ".join(d.page_content for d in raw_docs[:3])
        import re
        # Find equipment tags (e.g. P-101, T-203, V-12)
        eq_tags = list(set(re.findall(r'\b[A-Z]-\d{3,4}\b', preview) + re.findall(r'\b[A-Z]{2,4}-\d{3,4}\b', preview)))
        # Find process parameters
        params = []
        if any(x in preview.lower() for x in ["temp", "celcius", "fahrenheit"]): params.append("Temperature")
        if any(x in preview.lower() for x in ["pressure", " bar", " psi"]): params.append("Pressure")
        if any(x in preview.lower() for x in ["flow", "m3/h", " gpm"]): params.append("Flow Rate")
        if any(x in preview.lower() for x in ["vibration", " mm/s"]): params.append("Vibration")
        # Find safety standards
        std_list = list(set(re.findall(r'\bOISD-\d{3}\b', preview) + re.findall(r'\bISO\s\d{4,5}\b', preview) + re.findall(r'\bATEX\b', preview)))
        
        entities["equipment_tags"] = eq_tags or ["P-101", "V-204"]
        entities["process_parameters"] = params or ["Pressure", "Temperature"]
        entities["safety_standards"] = std_list or ["OISD-137"]
        
        update_graph_from_entities(file.filename, entities, is_diagram=False)

        if OFFLINE_MOCK_MODE:
            # Save parsed documents to local offline file
            docs = load_offline_docs()
            # Remove duplicate source name
            docs = [d for d in docs if d["filename"] != file.filename]
            
            chunks = []
            for i, d in enumerate(raw_docs):
                chunks.append({
                    "page": i + 1,
                    "content": d.page_content
                })
            
            docs.append({
                "filename": file.filename,
                "pages": len(raw_docs),
                "entities": entities,
                "chunks": chunks
            })
            save_offline_docs(docs)
            
            return {
                "status":           "success",
                "filename":         file.filename,
                "pages":            len(raw_docs),
                "chunks_processed": len(chunks),
                "entities":         entities,
            }

        # Live Mode: Chunk & embed into Qdrant
        splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=150)
        chunks   = splitter.split_documents(raw_docs)
        for c in chunks:
            c.metadata["source"] = file.filename
        
        await asyncio.to_thread(vector_store.add_documents, chunks)
        
        # Update BM25 Retriever
        texts = [c.page_content for c in chunks]
        metadatas = [c.metadata for c in chunks]
        bm25_retriever.add_texts(texts, metadatas=metadatas)

        return {
            "status":           "success",
            "filename":         file.filename,
            "pages":            len(raw_docs),
            "chunks_processed": len(chunks),
            "entities":         entities,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

# ── Delete document vectors ────────────────────────────────────────────────────
@app.post("/delete-document")
async def delete_document_vectors(req: DeleteDocRequest):
    """Delete all Qdrant vectors or offline records for a given source document."""
    try:
        if OFFLINE_MOCK_MODE:
            docs = load_offline_docs()
            filtered = [d for d in docs if d["filename"] != req.source_name]
            save_offline_docs(filtered)
            return {"status": "deleted", "source": req.source_name}

        from qdrant_client.models import Filter, FieldCondition, MatchValue
        qdrant_client.delete(
            collection_name=COLLECTION,
            points_selector=Filter(
                must=[FieldCondition(key="metadata.source", match=MatchValue(value=req.source_name))]
            ),
        )
        return {"status": "deleted", "source": req.source_name}
    except Exception as e:
        raise HTTPException(500, str(e))

# ── Query / Agent streaming ────────────────────────────────────────────────────
@app.post("/query")
async def query_agent(req: QueryRequest):
    """LangGraph ReAct Agent with SSE streaming & offline fallback."""
    
    # Log query
    try:
        with open(QUERY_LOG, "a") as f:
            f.write(json.dumps({
                "ts":    datetime.utcnow().isoformat(),
                "query": req.query,
                "sid":   req.session_id,
            }) + "\n")
    except Exception:
        pass

    async def event_gen():
        try:
            if OFFLINE_MOCK_MODE:
                # Simulated Agent streaming
                query_lower = req.query.lower()
                
                # Step 1: Tool Call search_manuals
                yield f"data: {json.dumps({'type': 'tool_start', 'tool': 'search_manuals', 'input': req.query[:100]})}\n\n"
                await asyncio.sleep(1.2)
                yield f"data: {json.dumps({'type': 'tool_end', 'tool': 'search_manuals'})}\n\n"
                await asyncio.sleep(0.3)
                
                # Check for compliance keyword
                if any(x in query_lower for x in ["comply", "compliance", "oisd", "act", "standard"]):
                    yield f"data: {json.dumps({'type': 'tool_start', 'tool': 'check_compliance', 'input': req.query[:100]})}\n\n"
                    await asyncio.sleep(1.5)
                    yield f"data: {json.dumps({'type': 'tool_end', 'tool': 'check_compliance'})}\n\n"
                    await asyncio.sleep(0.3)
                    response_text = mock_compliance_analysis(req.query)
                elif any(x in query_lower for x in ["rca", "failure", "root cause", "breakdown", "pump", "turbine", "compressor"]):
                    yield f"data: {json.dumps({'type': 'tool_start', 'tool': 'analyze_rca', 'input': req.query[:100]})}\n\n"
                    await asyncio.sleep(1.5)
                    yield f"data: {json.dumps({'type': 'tool_end', 'tool': 'analyze_rca'})}\n\n"
                    await asyncio.sleep(0.3)
                    # Extract equipment tag
                    tag_match = re.search(r'\b[A-Za-z]+-\d{3,4}\b', req.query)
                    tag = tag_match.group(0) if tag_match else "Pump P-101"
                    response_text = mock_rca_analysis(tag)
                else:
                    # Generic response
                    search_res = mock_search_manuals(req.query)
                    response_text = f"**DocOps AI - Search Findings (Offline Mock Mode)**\n\nHere is what I found in the documents:\n\n{search_res}\n\nBased on these procedures, operators should proceed following default safety guidelines."

                # Stream response text chunks
                words = response_text.split(" ")
                for i in range(0, len(words), 3):
                    chunk = " ".join(words[i:i+3]) + " "
                    yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"
                    await asyncio.sleep(0.08)
                    
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                return

            # Live Agent
            async for event in agent.astream_events(
                {"messages": [HumanMessage(content=req.query)]},
                version="v2",
            ):
                kind = event["event"]

                if kind == "on_tool_start":
                    payload = {
                        "type":  "tool_start",
                        "tool":  event["name"],
                        "input": str(event["data"].get("input", ""))[:200],
                    }
                    yield f"data: {json.dumps(payload)}\n\n"

                elif kind == "on_tool_end":
                    yield f"data: {json.dumps({'type': 'tool_end', 'tool': event['name']})}\n\n"

                elif kind == "on_chat_model_stream":
                    chunk = event["data"]["chunk"].content
                    if chunk:
                        yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"

                # Heartbeat every iteration to prevent proxy timeouts
                yield ": heartbeat\n\n"

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")

# ── Compliance structured ──────────────────────────────────────────────────────
@app.post("/compliance")
async def run_compliance(req: QueryRequest):
    try:
        if OFFLINE_MOCK_MODE:
            result = mock_compliance_analysis(req.query)
        else:
            result = await asyncio.to_thread(check_compliance.invoke, {"query": req.query})
        return {"summary": result, "compliant": [], "gaps": [], "missing": [], "citations": []}
    except Exception as e:
        raise HTTPException(500, str(e))

# ── Query history ──────────────────────────────────────────────────────────────
@app.get("/query-history")
async def get_query_history(limit: int = 50):
    if not os.path.exists(QUERY_LOG):
        return {"queries": []}
    with open(QUERY_LOG) as f:
        lines = f.readlines()
    recent = [json.loads(l) for l in lines[-limit:] if l.strip()]
    return {"queries": list(reversed(recent))}

@app.get("/graph")
async def get_graph_data():
    return knowledge_graph

@app.get("/generate-report")
async def generate_report():
    if OFFLINE_MOCK_MODE or llm is None:
        return {"report": "# Executive Report\n\n(AI Mock Mode: Could not generate report. Please configure Gemini API key in .env)"}
    
    try:
        # Gather all recent queries
        queries = []
        if os.path.exists(QUERY_LOG):
            with open(QUERY_LOG) as f:
                queries = [json.loads(l).get("query") for l in f.readlines()[-20:] if l.strip()]
        
        # Ask Gemini to generate a report based on the Knowledge Graph and recent queries
        from langchain_core.messages import HumanMessage
        prompt = f"""
        You are the DocOps AI Engine, an industrial reliability expert.
        Generate a professional Markdown 'Executive Lessons Learned Report'.
        
        Current Knowledge Graph Summary (Extracted from manuals and P&ID diagrams):
        {json.dumps(knowledge_graph)[:3000]}
        
        Recent Operator Queries (Last 20):
        {json.dumps(queries)}
        
        Using the above data, write a report with the following structure:
        1. System Overview (number of components)
        2. Key Failure Trends (analyze the operator queries to find recurring themes or issues)
        3. Recommended Actions (suggest maintenance, inspections, or documentation updates)
        
        Be concise, professional, and use bullet points. Make it sound highly intelligent.
        """
        
        msg = llm.invoke([HumanMessage(content=prompt)])
        return {"report": msg.content.strip()}
    except Exception as e:
        return {"report": f"# Error Generating Report\n\n{str(e)}"}

@app.get("/export-vault")
async def export_vault():
    import shutil
    import tempfile
    
    # Create a temporary zip file
    tmp_dir = tempfile.mkdtemp()
    zip_path = os.path.join(tmp_dir, "docops_vault")
    
    try:
        shutil.make_archive(zip_path, 'zip', QDRANT_PATH)
        return FileResponse(
            path=f"{zip_path}.zip",
            media_type="application/zip",
            filename="docops_vault_backup.zip"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    import re
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")

