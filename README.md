# DocOps Enterprise 🚀

DocOps is an advanced, AI-powered industrial documentation and diagnostics platform. It bridges the gap between massive, unstructured industrial manuals (P&ID diagrams, spec sheets, safety procedures) and the operational workforce on the ground.

## 🎯 Purpose of the Project
In heavy industries (oil & gas, manufacturing, chemical plants), operators and maintenance engineers lose hundreds of hours flipping through dense PDFs to find torque specifications, shutdown procedures, or RCA (Root Cause Analysis) history. 

DocOps acts as a **smart industrial assistant**. It ingests these massive documents, vectorizes the knowledge, and provides a real-time, context-aware Copilot. Furthermore, it integrates live IoT telemetry from the plant floor and offers AR barcode scanning, bridging the physical equipment with the digital documentation.

---

## ✅ Tasks Completed (MVP Level: 100%)
We have successfully built a massive, feature-complete Enterprise MVP (v2.4). The core architecture is fully functional across three tiers: Frontend (Next.js), Gateway (Node.js), and AI Engine (Python/FastAPI).

### Key Features Implemented:
1. **AI Document Ingestion Pipeline:** Extracts text and structures knowledge from PDFs into a local Qdrant Vector Database.
2. **Interactive AI Copilot (RAG):** Uses LangGraph and Gemini to provide semantic search, compliance verification, and 5-Why RCA based strictly on ingested documents.
3. **Live IoT Telemetry Dashboard:** Simulates and visualizes live pump (P-101) vibration and temperature data via WebSockets, including critical anomaly alerts.
4. **AR Asset Scanner:** In-browser camera overlay allowing operators to scan physical QR/Barcodes on machinery to instantly query the AI Copilot.
5. **True Offline AI (WebLLM):** Browser-based WebGPU Llama-3 integration allowing the LLM to run entirely on the local device without any external network dependency.
6. **Air-Gapped Sync:** Ability for Plant Managers to export the Qdrant vault as a `.zip` for deployment on disconnected, ruggedized field tablets.
7. **Role-Based Authentication:** JWT-based access control distinguishing between `operator` and `plant_manager` roles.

---

## ⚠️ Gaps & Limitations Found
While the MVP is robust, there are several "gaps" representing mock systems or unoptimized paths:
1. **Mock IoT Data:** The live telemetry is currently simulated via a `setInterval` in the Node.js Gateway. It needs to be hooked up to an actual MQTT broker or industrial historian (like OSIsoft PI).
2. **Local File Storage:** The Qdrant database and the JSON user store (`data/users.json`) are entirely local. This won't scale in a distributed cloud environment.
3. **Hardcoded Fallbacks:** If the Gemini API key fails, the backend falls back to a mock mode rather than graceful degradation or a localized Python LLM equivalent.
4. **WebLLM Initial Load:** Downloading the 4GB Llama-3 model to the browser cache takes significant time and bandwidth on the first run, which may hang lower-end devices.

---

## 🔮 What to Do Next (Roadmap)
1. **Database Migration:** Replace the local `users.json` with a managed PostgreSQL instance and migrate Qdrant to Qdrant Cloud.
2. **Live Vision Integration:** Expand the AR scanner to not just read barcodes, but use computer vision to identify gauge readings (e.g., analog pressure gauges).
3. **Dockerization:** Wrap the Frontend, Gateway, and Python Backend in a single `docker-compose.yml` for effortless 1-click deployments on-premise.
4. **Agentic Workflows:** Allow the Copilot to actually *execute* actions, such as automatically generating a PDF maintenance ticket and emailing it to the shift supervisor.

---

## 📖 User Manual
### 1. Prerequisites
- Node.js (v18+)
- Python (3.10+)
- Gemini API Key

### 2. Starting the Services
You must start all three services in separate terminals:

**Terminal 1: AI Engine (Backend)**
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python main.py
```
*(Runs on http://localhost:8000)*

**Terminal 2: Gateway (Middleware)**
```bash
cd gateway
npm install
node server.js
```
*(Runs on http://localhost:3001)*

**Terminal 3: Frontend (UI)**
```bash
cd frontend
npm install
npm run dev
```
*(Runs on http://localhost:3000)*

### 3. Using the App
- Navigate to `http://localhost:3000`.
- Log in using the test credentials below.
- Go to **Documents** to upload a PDF manual (e.g., pump maintenance guide).
- Go to the **Dashboard** to see the live telemetry pulsing.
- Use the **Scan Asset** button in the sidebar to simulate an AR tag scan.
- Chat with the **AI Copilot** to extract knowledge from your uploaded PDFs.

---

## 🔑 Testing Login Credentials
Use the following credentials to access the system:

| Role | Username | Password |
| :--- | :--- | :--- |
| **Plant Manager** | `admin` | `admin123` |
| **Operator** | `operator1` | `ops123` |

*(Note: Plant Managers have access to the "Export Knowledge Vault" and Document Deletion features).*
