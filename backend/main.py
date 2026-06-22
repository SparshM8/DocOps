"""DocOps — Industrial Knowledge Copilot API v2

Set OPENAI_API_KEY in a .env file, then run:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import json
import os
import re
import uuid
from pathlib import Path

import fitz  # PyMuPDF
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.documents import Document
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pydantic import BaseModel, Field
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
QDRANT_PATH = BASE_DIR / "qdrant_data"
COLLECTION_NAME = "industrial_manuals"
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536
TOP_K = 5

QDRANT_PATH.mkdir(exist_ok=True)

app = FastAPI(title="DocOps Industrial Knowledge Copilot API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

qdrant = QdrantClient(path=str(QDRANT_PATH))
splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=180)


# ── Pydantic Models ────────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=4000)


class EntityList(BaseModel):
    equipment_tags: list[str] = Field(default_factory=list)
    process_parameters: list[str] = Field(default_factory=list)
    safety_standards: list[str] = Field(default_factory=list)


class UploadResponse(BaseModel):
    status: str
    filename: str
    chunks_processed: int
    entities: EntityList


class Citation(BaseModel):
    filename: str
    page: int | str
    score: float
    excerpt: str


class QueryResponse(BaseModel):
    answer: str
    citations: list[Citation]


class ComplianceRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=4000)


class ComplianceResponse(BaseModel):
    summary: str
    compliant: list[str]
    gaps: list[str]
    missing: list[str]
    citations: list[Citation]


# ── Core Helpers ──────────────────────────────────────────────────────────────

def get_embeddings() -> OpenAIEmbeddings:
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is missing. Add it to backend/.env.",
        )
    return OpenAIEmbeddings(model=EMBEDDING_MODEL)


def get_llm() -> ChatOpenAI:
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is missing. Add it to backend/.env.",
        )
    return ChatOpenAI(model="gpt-4o-mini", temperature=0)


def ensure_collection() -> None:
    if not qdrant.collection_exists(COLLECTION_NAME):
        qdrant.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=EMBEDDING_DIMENSIONS, distance=Distance.COSINE),
        )


def extract_page_documents(pdf_bytes: bytes, filename: str) -> list[Document]:
    try:
        pdf = fitz.open(stream=pdf_bytes, filetype="pdf")
    except (fitz.FileDataError, RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="The uploaded file is not a readable PDF.") from exc

    page_documents: list[Document] = []
    try:
        for page_index, page in enumerate(pdf):
            text = page.get_text("text").strip()
            if text:
                page_documents.append(
                    Document(
                        page_content=text,
                        metadata={"filename": filename, "page_number": page_index + 1},
                    )
                )
    finally:
        pdf.close()

    if not page_documents:
        raise HTTPException(
            status_code=422,
            detail="No extractable text found. This may be a scanned/image-only PDF.",
        )
    return page_documents


def _parse_json_from_llm(raw: str) -> dict:
    """Strip markdown fences and parse JSON from an LLM response."""
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`").strip()
    return json.loads(cleaned)


def extract_entities(text_sample: str, llm: ChatOpenAI) -> EntityList:
    """LLM-based entity extraction. Returns empty EntityList on any failure."""
    prompt = (
        "You are an industrial document parser. Extract entities from the text below.\n"
        "Return ONLY valid JSON — no markdown, no explanation.\n\n"
        "Required format:\n"
        '{"equipment_tags": ["equipment IDs and names, e.g. Pump A-12, Valve 4B, Turbine T-01"],\n'
        ' "process_parameters": ["measured parameters with values, e.g. Max RPM: 3600, Oil Pressure: 45 PSI"],\n'
        ' "safety_standards": ["regulations and standards, e.g. OISD-137, Factory Act, PESO, IS:5572"]}\n\n'
        "Limit each list to 10 items max. If none found, use [].\n\n"
        f"Document text:\n{text_sample[:3000]}"
    )
    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        raw = response.content if isinstance(response.content, str) else str(response.content)
        data = _parse_json_from_llm(raw)
        return EntityList(
            equipment_tags=[str(t) for t in data.get("equipment_tags", [])][:10],
            process_parameters=[str(p) for p in data.get("process_parameters", [])][:10],
            safety_standards=[str(s) for s in data.get("safety_standards", [])][:10],
        )
    except Exception:
        return EntityList()


def build_citations(results: list) -> list[Citation]:
    return [
        Citation(
            filename=(r.payload or {}).get("filename", "Unknown"),
            page=(r.payload or {}).get("page_number", "?"),
            score=round(r.score, 3),
            excerpt=((r.payload or {}).get("text", ""))[:220],
        )
        for r in results
        if r.payload
    ]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/tags")
def get_equipment_tags() -> dict[str, list[str]]:
    """Return all unique equipment tags indexed across all documents."""
    if not qdrant.collection_exists(COLLECTION_NAME):
        return {"tags": []}

    all_tags: set[str] = set()
    offset = None
    while True:
        results, next_offset = qdrant.scroll(
            collection_name=COLLECTION_NAME,
            scroll_filter=None,
            offset=offset,
            limit=200,
            with_payload=True,
            with_vectors=False,
        )
        for point in results:
            tags = (point.payload or {}).get("equipment_tags", [])
            all_tags.update(tags)
        if next_offset is None:
            break
        offset = next_offset

    return {"tags": sorted(all_tags)}


@app.post("/upload", response_model=UploadResponse)
async def upload_pdf(file: UploadFile = File(...)) -> UploadResponse:
    if (
        file.content_type not in {"application/pdf", "application/x-pdf"}
        and not (file.filename or "").lower().endswith(".pdf")
    ):
        raise HTTPException(status_code=400, detail="Only PDF uploads are supported.")

    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    filename = Path(file.filename or "uploaded_manual.pdf").name
    page_documents = extract_page_documents(pdf_bytes, filename)
    chunks = splitter.split_documents(page_documents)
    if not chunks:
        raise HTTPException(status_code=422, detail="No usable text chunks generated.")

    # Use first 5 pages as text sample for entity extraction
    text_sample = "\n\n".join(d.page_content for d in page_documents[:5])

    embeddings = get_embeddings()
    llm = get_llm()

    # Extract entities (graceful — empty lists on failure)
    entities = extract_entities(text_sample, llm)

    try:
        vectors = embeddings.embed_documents([chunk.page_content for chunk in chunks])
        ensure_collection()
        points = [
            PointStruct(
                id=str(uuid.uuid4()),
                vector=vector,
                payload={
                    "text": chunk.page_content,
                    "filename": chunk.metadata["filename"],
                    "page_number": chunk.metadata["page_number"],
                    "equipment_tags": entities.equipment_tags,
                },
            )
            for chunk, vector in zip(chunks, vectors, strict=True)
        ]
        qdrant.upsert(collection_name=COLLECTION_NAME, points=points, wait=True)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not store embeddings: {exc}") from exc

    return UploadResponse(
        status="success",
        filename=filename,
        chunks_processed=len(chunks),
        entities=entities,
    )


@app.post("/query", response_model=QueryResponse)
def query_manuals(request: QueryRequest) -> QueryResponse:
    if not qdrant.collection_exists(COLLECTION_NAME):
        raise HTTPException(status_code=404, detail="No manuals have been uploaded yet.")

    embeddings = get_embeddings()
    try:
        query_vector = embeddings.embed_query(request.query)
        results = qdrant.query_points(
            collection_name=COLLECTION_NAME,
            query=query_vector,
            limit=TOP_K,
            with_payload=True,
        ).points
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Search failed: {exc}") from exc

    if not results:
        raise HTTPException(status_code=404, detail="No relevant content found.")

    context_sections = [
        f"SOURCE: {(r.payload or {}).get('filename', 'Unknown')} | Page {(r.payload or {}).get('page_number', '?')}\n"
        f"{(r.payload or {}).get('text', '')}"
        for r in results
    ]
    context = "\n\n---\n\n".join(context_sections)

    system_prompt = (
        "You are an industrial knowledge assistant. Answer only from the supplied manual excerpts. "
        "Be concise, practical, and safety-conscious. If the excerpts do not contain the answer, say: "
        "'I could not find that in the uploaded manuals.' Do not use outside knowledge.\n\n"
        f"MANUAL EXCERPTS:\n{context}"
    )

    try:
        response = get_llm().invoke(
            [SystemMessage(content=system_prompt), HumanMessage(content=request.query)]
        )
        answer = response.content if isinstance(response.content, str) else str(response.content)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM failed: {exc}") from exc

    return QueryResponse(answer=answer, citations=build_citations(results))


@app.post("/compliance", response_model=ComplianceResponse)
def compliance_check(request: ComplianceRequest) -> ComplianceResponse:
    """Gap analysis: compare uploaded procedures against regulatory standards."""
    if not qdrant.collection_exists(COLLECTION_NAME):
        raise HTTPException(status_code=404, detail="No manuals have been uploaded yet.")

    embeddings = get_embeddings()
    try:
        query_vector = embeddings.embed_query(request.query)
        results = qdrant.query_points(
            collection_name=COLLECTION_NAME,
            query=query_vector,
            limit=6,
            with_payload=True,
        ).points
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Search failed: {exc}") from exc

    if not results:
        raise HTTPException(status_code=404, detail="No relevant content found for compliance analysis.")

    context_sections = [
        f"SOURCE: {(r.payload or {}).get('filename', 'Unknown')} | Page {(r.payload or {}).get('page_number', '?')}\n"
        f"{(r.payload or {}).get('text', '')}"
        for r in results
    ]
    context = "\n\n---\n\n".join(context_sections)

    system_prompt = (
        "You are an industrial compliance analyst specializing in Indian industrial regulations "
        "(OISD, PESO, Factory Act, BIS/IS standards, Environmental Protection Act) and "
        "international standards (ISO 45001, IEC 61511, API standards).\n\n"
        "Analyze the provided document excerpts for the compliance query. "
        "Return ONLY valid JSON — no markdown, no explanation.\n\n"
        "Required format:\n"
        '{"summary": "1-2 sentence overall compliance status",\n'
        ' "compliant": ["specific items/procedures present that satisfy requirements"],\n'
        ' "gaps": ["items partially addressed or needing clarification"],\n'
        ' "missing": ["requirements completely absent from the uploaded documents"]}\n\n'
        f"DOCUMENT EXCERPTS:\n{context}"
    )

    try:
        response = get_llm().invoke(
            [SystemMessage(content=system_prompt), HumanMessage(content=request.query)]
        )
        raw = response.content if isinstance(response.content, str) else str(response.content)
        data = _parse_json_from_llm(raw)

        return ComplianceResponse(
            summary=data.get("summary", "Analysis complete."),
            compliant=data.get("compliant", []),
            gaps=data.get("gaps", []),
            missing=data.get("missing", []),
            citations=build_citations(results),
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Compliance analysis failed: {exc}") from exc
