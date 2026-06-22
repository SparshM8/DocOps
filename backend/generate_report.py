import os
from fpdf import FPDF

class DocOpsReportPDF(FPDF):
    def header(self):
        self.set_font('helvetica', 'B', 8)
        self.set_text_color(140, 150, 170)
        self.cell(0, 10, 'DOCOPS ENTERPRISE V2.4 - SYSTEM ARCHITECTURE REPORT', new_x="RIGHT", new_y="TOP", align='L')
        self.cell(0, 10, 'CONFIDENTIAL', new_x="LMARGIN", new_y="NEXT", align='R')
        self.ln(3)

    def footer(self):
        self.set_y(-15)
        self.set_font('helvetica', 'I', 8)
        self.set_text_color(140, 150, 170)
        self.cell(0, 10, f'Page {self.page_no()}', new_x="RIGHT", new_y="TOP", align='C')

def create_report():
    pdf = DocOpsReportPDF()
    pdf.set_margins(20, 20, 20)
    pdf.alias_nb_pages()
    
    # ─── PAGE 1: TITLE PAGE ──────────────────────────────────────────────────
    pdf.add_page()
    pdf.ln(40)
    
    pdf.set_fill_color(15, 23, 42)
    pdf.rect(20, 50, 170, 8, 'F')
    
    pdf.ln(10)
    pdf.set_font('helvetica', 'B', 32)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 15, 'DocOps Enterprise', new_x="LMARGIN", new_y="NEXT", align='L')
    
    pdf.set_font('helvetica', 'I', 18)
    pdf.set_text_color(71, 85, 105)
    pdf.cell(0, 10, 'Living Industrial Knowledge Base Platform (v2.4)', new_x="LMARGIN", new_y="NEXT", align='L')
    
    pdf.ln(15)
    pdf.set_draw_color(173, 198, 255)
    pdf.set_line_width(1)
    pdf.line(20, 105, 190, 105)
    
    pdf.ln(10)
    pdf.set_font('helvetica', '', 11)
    pdf.set_text_color(51, 65, 85)
    
    summary_text = (
        "DocOps is an advanced industrial SaaS platform designed to transition static documentation, "
        "including plant manuals, Standard Operating Procedures (SOPs), and safety regulations, "
        "into a dynamic, queryable Knowledge Graph. Utilizing local AI models via LangGraph ReAct agents "
        "and Qdrant Vector Databases, DocOps automates semantic retrieval, performs regulatory compliance gap audits, "
        "and executes maintenance Root Cause Analysis (RCA) with a streamlined web console."
    )
    pdf.multi_cell(0, 7, summary_text)
    pdf.ln(40)
    
    pdf.set_font('helvetica', 'B', 10)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(40, 6, 'Date of Publication:', new_x="RIGHT", new_y="TOP")
    pdf.set_font('helvetica', '', 10)
    pdf.cell(0, 6, 'June 22, 2026', new_x="LMARGIN", new_y="NEXT")
    
    pdf.set_font('helvetica', 'B', 10)
    pdf.cell(40, 6, 'System Version:', new_x="RIGHT", new_y="TOP")
    pdf.set_font('helvetica', '', 10)
    pdf.cell(0, 6, 'v2.4.0 (Production Hardened)', new_x="LMARGIN", new_y="NEXT")
    
    pdf.set_font('helvetica', 'B', 10)
    pdf.cell(40, 6, 'Author/Dev Team:', new_x="RIGHT", new_y="TOP")
    pdf.set_font('helvetica', '', 10)
    pdf.cell(0, 6, 'Antigravity AI Coding Assistant', new_x="LMARGIN", new_y="NEXT")
    
    # ─── PAGE 2: ARCHITECTURE ────────────────────────────────────────────────
    pdf.add_page()
    
    pdf.set_font('helvetica', 'B', 18)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 10, '1. System Architecture & Components', new_x="LMARGIN", new_y="NEXT", align='L')
    pdf.ln(4)
    
    pdf.set_font('helvetica', '', 10)
    pdf.set_text_color(51, 65, 85)
    
    arch_intro = (
        "The DocOps platform follows a modern, decoupled three-tier architecture structured to ensure "
        "security, high throughput, and system resiliency even during offline states."
    )
    pdf.multi_cell(0, 6, arch_intro)
    pdf.ln(4)
    
    # 1.1 Frontend
    pdf.set_font('helvetica', 'B', 12)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 8, '1.1 Next.js Frontend UI (Client Tier)', new_x="LMARGIN", new_y="NEXT", align='L')
    pdf.set_font('helvetica', '', 10)
    pdf.set_text_color(51, 65, 85)
    frontend_desc = (
        "Built using Next.js with React 18, the frontend is fully modularized to separate concern layers. "
        "Design tokens are centralized in Theme.tsx, specifying a premium HSL color palette. Views include: "
        "\n- DashboardHome: Displays real-time operational statistics and system health indicators. "
        "\n- CopilotWorkspace: Connects client browsers to Server-Sent Event streams with active tool execution steps. "
        "\n- DocumentsPage: Drag-and-drop file ingestion area with status logs and entity metadata inspector. "
        "\n- AnalyticsPage: Visualizes entity coverage ratios and query logs."
    )
    pdf.multi_cell(0, 6, frontend_desc)
    pdf.ln(4)
    
    # 1.2 Gateway
    pdf.set_font('helvetica', 'B', 12)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 8, '1.2 Express Security Gateway (API Middleware)', new_x="LMARGIN", new_y="NEXT", align='L')
    pdf.set_font('helvetica', '', 10)
    pdf.set_text_color(51, 65, 85)
    gateway_desc = (
        "Constructed in Node.js, the Gateway protects internal resources. It implements: "
        "\n- Authentication: Stateless JWT access tokens validating Field Technicians and Plant Managers. "
        "\n- Storage Fallback: Uses MongoDB when accessible; otherwise automatically mounts a local JSON file-based database for zero-config installations. "
        "\n- API Proxies: Smoothly routes queries, uploads, compliance checks, and query histories."
    )
    pdf.multi_cell(0, 6, gateway_desc)
    pdf.ln(4)
    
    # 1.3 AI Engine
    pdf.set_font('helvetica', 'B', 12)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 8, '1.3 Python FastAPI AI Engine (RAG Pipeline Tier)', new_x="LMARGIN", new_y="NEXT", align='L')
    pdf.set_font('helvetica', '', 10)
    pdf.set_text_color(51, 65, 85)
    ai_desc = (
        "Written in Python 3.12, the backend leverages LangGraph to create a ReAct Agent backed by Ollama "
        "local embeddings. If Ollama is offline or uninstalled, the backend triggers an automatic "
        "OFFLINE_MOCK_MODE. In mock mode, documents are parsed, chunked, and queried locally using "
        "high-speed regex and keyword similarity algorithms, providing 100% platform uptime."
    )
    pdf.multi_cell(0, 6, ai_desc)
    
    # ─── PAGE 3: FEATURES & API ──────────────────────────────────────────────
    pdf.add_page()
    
    pdf.set_font('helvetica', 'B', 18)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 10, '2. Platform Features & Capabilities', new_x="LMARGIN", new_y="NEXT", align='L')
    pdf.ln(4)
    
    pdf.set_font('helvetica', 'B', 12)
    pdf.cell(0, 8, '2.1 Document Ingestion & Vectorization', new_x="LMARGIN", new_y="NEXT", align='L')
    pdf.set_font('helvetica', '', 10)
    pdf.set_text_color(51, 65, 85)
    feat1 = (
        "When a Plant Manager uploads a PDF, the backend splits it using RecursiveCharacterTextSplitter "
        "(chunk size: 800, overlap: 150) and generates 768-dimension vectors (nomic-embed-text) in "
        "Qdrant Vector Database. E.g., equipment IDs (P-101, T-201) are extracted as tags."
    )
    pdf.multi_cell(0, 6, feat1)
    pdf.ln(4)
    
    pdf.set_font('helvetica', 'B', 12)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 8, '2.2 Semantic Search & Regulatory Compliance Gap Audits', new_x="LMARGIN", new_y="NEXT", align='L')
    pdf.set_font('helvetica', '', 10)
    pdf.set_text_color(51, 65, 85)
    feat2 = (
        "Using check_compliance tools, the agent cross-references uploaded SOP logs against standard safety "
        "regulations (OISD, ATEX, Factory Acts). The output outlines: 1) COMPLIANT items, "
        "2) OBSERVED GAPS, 3) MISSING components, and 4) RECOMMENDATIONS."
    )
    pdf.multi_cell(0, 6, feat2)
    pdf.ln(4)
    
    pdf.set_font('helvetica', 'B', 12)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 8, '2.3 Root Cause Analysis (RCA)', new_x="LMARGIN", new_y="NEXT", align='L')
    pdf.set_font('helvetica', '', 10)
    pdf.set_text_color(51, 65, 85)
    feat3 = (
        "A customized RCA maintenance tool performs a 5-Why Analysis to discover root failure modes "
        "for designated equipment tags (e.g. Pump P-101 casing vibration due to suction blockages)."
    )
    pdf.multi_cell(0, 6, feat3)
    pdf.ln(8)
    
    pdf.set_font('helvetica', 'B', 14)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 8, '3. API Architecture Endpoints', new_x="LMARGIN", new_y="NEXT", align='L')
    pdf.ln(2)
    
    # Draw simple table header
    pdf.set_fill_color(241, 245, 249)
    pdf.set_font('helvetica', 'B', 9)
    pdf.set_text_color(71, 85, 105)
    pdf.cell(35, 8, ' Endpoint', 1, 0, 'L', True)
    pdf.cell(20, 8, ' Method', 1, 0, 'L', True)
    pdf.cell(30, 8, ' Service Layer', 1, 0, 'L', True)
    pdf.cell(85, 8, ' Description', 1, 1, 'L', True)
    
    # Rows
    pdf.set_font('helvetica', '', 9)
    pdf.set_text_color(51, 65, 85)
    
    endpoints = [
      ('/api/health', 'GET', 'Gateway', 'Retrieves real-time system status indicators'),
      ('/api/auth/login', 'POST', 'Gateway', 'Validates credentials & returns JWT bearer token'),
      ('/api/upload', 'POST', 'Gateway/AI', 'Parses PDFs, extracts entities, loads vectors'),
      ('/api/query', 'POST', 'Gateway/AI', 'Streams SSE LangGraph agent tool responses'),
      ('/api/stats', 'GET', 'Gateway/AI', 'Returns vector, document, query & user statistics'),
      ('/api/query-history', 'GET', 'Gateway/AI', 'Exposes audit trails of recent operator searches')
    ]
    
    for ep, meth, svc, desc in endpoints:
        pdf.cell(35, 8, f' {ep}', 1, 0, 'L')
        pdf.cell(20, 8, f' {meth}', 1, 0, 'L')
        pdf.cell(30, 8, f' {svc}', 1, 0, 'L')
        pdf.cell(85, 8, f' {desc}', 1, 1, 'L')

    # Save PDF to project root directory
    pdf.output('../DocOps_Detailed_Project_Report.pdf')
    print("Report generated successfully.")

if __name__ == '__main__':
    create_report()
