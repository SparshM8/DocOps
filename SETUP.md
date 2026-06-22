# DocOps — Setup & Run Guide

## Prerequisites
- Python 3.10+ installed
- Node.js 18+ installed  
- An OpenAI API key (get one at https://platform.openai.com/api-keys)

---

## Step 1: Set your OpenAI API Key

Edit `backend/.env`:
```
OPENAI_API_KEY=sk-proj-your-actual-key-here
```

---

## Step 2: Install Python dependencies

```bash
cd backend
pip install -r requirements.txt
```

---

## Step 3: Install Node.js dependencies

```bash
cd gateway
npm install

cd ../frontend
npm install
```

---

## Step 4: Start the project

**Option A — All at once (Windows)**
```
Double-click: start-all.bat
```

**Option B — Manually (3 separate terminals)**

Terminal 1 — AI Backend (port 8000):
```bash
cd backend
python main.py
```

Terminal 2 — Gateway (port 3001):
```bash
cd gateway
node server.js
```

Terminal 3 — Frontend (port 3000):
```bash
cd frontend
npm run dev
```

---

## Step 5: Use the app

Open http://localhost:3000

1. **Register** a new account (choose Plant Manager role to upload docs)
2. **Login** with your credentials
3. Go to **AI Copilot** → upload a PDF manual
4. Ask questions like:
   - *"Find the shutdown sequence for Pump P-101"*
   - *"Does this procedure comply with OISD-137?"*
   - *"Perform RCA on Compressor C-4"*

---

## Service URLs

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | http://localhost:3000 | Next.js UI |
| Gateway | http://localhost:3001 | Express API |
| AI Backend | http://localhost:8000 | FastAPI + LangGraph |
| Health Check | http://localhost:3001/api/health | Status |

---

## Optional: MongoDB Atlas (persistent data)

By default, the gateway stores users/documents in `gateway/data/*.json` (JSON files).

For proper persistence with MongoDB Atlas (free):
1. Create a free cluster at https://cloud.mongodb.com
2. Edit `gateway/.env`:
   ```
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/docops
   ```
3. Restart the gateway — it will auto-detect and switch to MongoDB.
