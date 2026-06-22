import os
import json
import shutil
import asyncio
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

# LangChain — Ollama (local, free, no API key)
from langchain_ollama import ChatOllama, OllamaEmbeddings

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

load_dotenv()

# ── Config ─────────────────────────────────────────────────────────────────────
OLLAMA_BASE_URL  = os.getenv("OLLAMA_BASE_URL",  "http://localhost:11434")
OLLAMA_LLM_MODEL = os.getenv("OLLAMA_LLM_MODEL", "llama3.2")
OLLAMA_EMB_MODEL = os.getenv("OLLAMA_EMB_MODEL", "nomic-embed-text")

QDRANT_URL    = os.getenv("QDRANT_URL",  "local")
QDRANT_PATH   = os.path.join(os.path.dirname(__file__), "qdrant_data")
QDRANT_APIKEY = os.getenv("QDRANT_API_KEY", "")
COLLECTION    = "docops_manuals"
EMBED_DIM     = 768   # nomic-embed-text dimension

# Query history log
QUERY_LOG = os.path.join(os.path.dirname(__file__), "query_history.jsonl")

# ── Ollama health check ────────────────────────────────────────────────────────
def check_ollama():
    import urllib.request
    try:
        urllib.request.urlopen(f"{OLLAMA_BASE_URL}/api/tags", timeout=3)
        return True
    except Exception:
        return False

# ── Qdrant setup ───────────────────────────────────────────────────────────────
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
OFFLINE_MOCK_MODE = not check_ollama()

class MockEmbeddings:
    def embed_documents(self, texts):
        return [[0.0] * EMBED_DIM for _ in texts]
    def embed_query(self, text):
        return [0.0] * EMBED_DIM

if OFFLINE_MOCK_MODE:
    print("WARNING: Ollama is offline! Starting in OFFLINE MOCK MODE.")
    embeddings = MockEmbeddings()
    llm = None
    vector_store = None
    agent = None
else:
    try:
        embeddings = OllamaEmbeddings(
            model=OLLAMA_EMB_MODEL,
            base_url=OLLAMA_BASE_URL,
        )
        llm = ChatOllama(
            model=OLLAMA_LLM_MODEL,
            base_url=OLLAMA_BASE_URL,
            temperature=0.1,
            streaming=True,
        )
        vector_store = QdrantVectorStore(
            client=qdrant_client,
            collection_name=COLLECTION,
            embedding=embeddings,
        )
    except Exception as e:
        print(f"Error connecting to Ollama: {e}. Falling back to OFFLINE MOCK MODE.")
        OFFLINE_MOCK_MODE = True
        embeddings = MockEmbeddings()
        llm = None
        vector_store = None
        agent = None

# ── System Prompt ──────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are DocOps AI — an expert industrial knowledge assistant for plant operations.

You have access to three tools:
- search_manuals: Search uploaded plant manuals, SOPs, and safety procedures
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
        results = vector_store.similarity_search_with_score(query, k=5)
        if not results:
            return "No documents found. Please upload relevant PDF manuals first using the Documents section."
        parts = []
        for doc, score in results:
            src  = doc.metadata.get("source", "Unknown Document")
            page = doc.metadata.get("page", "?")
            parts.append(f"[{src} | Page {page} | Score: {score:.2f}]\n{doc.page_content.strip()}")
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
    ollama_ok = check_ollama()
    if not ollama_ok:
        print("WARNING: Ollama is not running! Started in offline/mock mode.")
    else:
        print(f"Ollama connected at {OLLAMA_BASE_URL}")
        print(f"   LLM: {OLLAMA_LLM_MODEL} | Embeddings: {OLLAMA_EMB_MODEL}")
    yield

app = FastAPI(
    title="DocOps AI Engine",
    description="Industrial Knowledge AI Platform — Powered by Ollama + LangGraph",
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
    ollama_ok = not OFFLINE_MOCK_MODE
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
        "status":       "ok" if (ollama_ok or OFFLINE_MOCK_MODE) else "degraded",
        "ollama":       "connected" if ollama_ok else "offline (mock mode enabled)",
        "llm_model":    OLLAMA_LLM_MODEL,
        "embed_model":  OLLAMA_EMB_MODEL,
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
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported.")

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

if __name__ == "__main__":
    import uvicorn
    import re
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")

