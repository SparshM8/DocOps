"use strict";

require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const multer   = require("multer");
const mongoose = require("mongoose");
const jwt      = require("jsonwebtoken");
const fs       = require("fs");
const path     = require("path");
const crypto   = require("crypto");

const User     = require("./models/User");
const Document = require("./models/Document");

const app            = express();
const PORT           = Number(process.env.PORT) || 3001;
const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://localhost:8000";
const JWT_SECRET     = process.env.JWT_SECRET     || "docops_super_secret_jwt_2024";
const MONGODB_URI    = process.env.MONGODB_URI    || "";

// ── Simple JSON file-based store (fallback when MongoDB not available) ─────────
const DATA_DIR = path.join(__dirname, "data");

function initFileStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const usersFile = path.join(DATA_DIR, "users.json");
  const docsFile  = path.join(DATA_DIR, "documents.json");

  if (!fs.existsSync(usersFile))  fs.writeFileSync(usersFile, "[]");
  if (!fs.existsSync(docsFile))   fs.writeFileSync(docsFile,  "[]");
}

function readStore(file) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")); } catch { return []; }
}
function writeStore(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

// Password hashing without bcrypt dependency for file store
async function hashPassword(pwd) {
  return new Promise((res, rej) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.pbkdf2(pwd, salt, 100000, 64, "sha512", (err, dk) => {
      if (err) rej(err);
      else res(`${salt}:${dk.toString("hex")}`);
    });
  });
}
async function verifyPassword(pwd, hash) {
  return new Promise((res, rej) => {
    const [salt, stored] = hash.split(":");
    crypto.pbkdf2(pwd, salt, 100000, 64, "sha512", (err, dk) => {
      if (err) rej(err);
      else res(dk.toString("hex") === stored);
    });
  });
}

// ── DB adapters — uses MongoDB if available, else JSON files ──────────────────
let useMongoose = false;

async function connectDB() {
  const uri = MONGODB_URI;
  if (uri && !uri.includes("localhost") || (uri && uri.includes("localhost"))) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      console.log("✅ MongoDB connected:", uri.replace(/\/\/.*@/, "//***@"));
      useMongoose = true;
      return;
    } catch (err) {
      console.warn("⚠️  MongoDB unavailable:", err.message);
    }
  }
  initFileStore();
  console.log("✅ Using local JSON file store at", DATA_DIR);
  console.log("   (Set MONGODB_URI in gateway/.env for persistent MongoDB)");
}

// ── Unified DB API ─────────────────────────────────────────────────────────────
const db = {
  async findUser(username) {
    if (useMongoose) return User.findOne({ username });
    return readStore("users.json").find(u => u.username === username) || null;
  },
  async createUser({ username, password, role }) {
    const hashedPwd = useMongoose ? password : await hashPassword(password);
    if (useMongoose) {
      const u = new User({ username, password, role });
      return u.save();
    }
    const users = readStore("users.json");
    const newUser = { _id: crypto.randomUUID(), username, password: hashedPwd, role, createdAt: new Date().toISOString() };
    users.push(newUser);
    writeStore("users.json", users);
    return newUser;
  },
  async verifyUserPassword(user, password) {
    if (useMongoose) return user.comparePassword(password);
    return verifyPassword(password, user.password);
  },
  async listDocs() {
    if (useMongoose) return Document.find().sort({ createdAt: -1 });
    return readStore("documents.json").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  async createDoc(data) {
    if (useMongoose) { const d = new Document(data); return d.save(); }
    const docs = readStore("documents.json");
    const doc  = { _id: crypto.randomUUID(), ...data, createdAt: new Date().toISOString() };
    docs.push(doc); writeStore("documents.json", docs);
    return doc;
  },
  async updateDoc(docId, updates) {
    if (useMongoose) return Document.findOneAndUpdate({ docId }, updates, { new: true });
    const docs  = readStore("documents.json");
    const idx   = docs.findIndex(d => d.docId === docId);
    if (idx === -1) return null;
    docs[idx] = { ...docs[idx], ...updates, updatedAt: new Date().toISOString() };
    writeStore("documents.json", docs);
    return docs[idx];
  },
  async deleteDoc(id) {
    if (useMongoose) return Document.findByIdAndDelete(id);
    const docs    = readStore("documents.json");
    const filtered = docs.filter(d => d._id !== id && d.docId !== id);
    writeStore("documents.json", filtered);
    return true;
  },
};

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "2mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
    cb(ok ? null : new Error("Only PDF files are supported."), ok);
  },
});

async function readPythonResponse(response) {
  const ct   = response.headers.get("content-type") || "";
  const body = ct.includes("application/json") ? await response.json() : { detail: await response.text() };
  if (!response.ok) {
    const err  = new Error(body.detail || body.message || `Python API ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return body;
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ detail: "Unauthorized" });
  try { req.user = jwt.verify(auth.split(" ")[1], JWT_SECRET); next(); }
  catch { return res.status(401).json({ detail: "Invalid or expired token" }); }
}

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/api/health", async (_req, res) => {
  let aiStatus = "offline";
  try {
    const r = await fetch(`${PYTHON_API_URL}/health`, { signal: AbortSignal.timeout(3000) });
    const d = await r.json();
    aiStatus = d.status === "ok" ? `ok (${d.vector_count ?? 0} vectors)` : d.status;
  } catch (err) {
    console.error("Health check fetch error:", err);
    aiStatus = "offline — start python backend";
  }
  res.json({
    gateway:    "ok",
    database:   useMongoose ? "mongodb" : "json-file",
    ai_backend: aiStatus,
  });
});

app.get("/api/stats", requireAuth, async (req, res, next) => {
  try {
    const pythonRes = await fetch(`${PYTHON_API_URL}/stats`, { signal: AbortSignal.timeout(5000) });
    const data = await pythonRes.json();
    
    let userCount = 0;
    if (useMongoose) {
      userCount = await mongoose.model("User").countDocuments();
    } else {
      userCount = readStore("users.json").length;
    }
    
    res.json({
      ...data,
      user_count: userCount
    });
  } catch (err) {
    let userCount = 0;
    try {
      if (useMongoose) userCount = await mongoose.model("User").countDocuments();
      else userCount = readStore("users.json").length;
    } catch {}
    res.json({
      vector_count: 0,
      document_count: 0,
      query_count: 0,
      user_count: userCount,
      documents: [],
      error: err.message
    });
  }
});

// ── Auth ──────────────────────────────────────────────────────────────────────
app.post("/api/auth/register", async (req, res, next) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ detail: "Username and password required" });

    const existing = await db.findUser(username);
    if (existing) return res.status(400).json({ detail: "Username already taken" });

    await db.createUser({ username, password, role: role || "field_technician" });
    res.status(201).json({ message: "Registered successfully" });
  } catch (err) { next(err); }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ detail: "Username and password required" });

    const user = await db.findUser(username);
    if (!user) return res.status(401).json({ detail: "Invalid credentials" });

    const match = await db.verifyUserPassword(user, password);
    if (!match) return res.status(401).json({ detail: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, role: user.role, username: user.username },
      JWT_SECRET, { expiresIn: "7d" }
    );
    res.json({ token, user: { id: user._id, username: user.username, role: user.role } });
  } catch (err) { next(err); }
});

// ── Documents ─────────────────────────────────────────────────────────────────
app.get("/api/documents", requireAuth, async (_req, res, next) => {
  try { res.json(await db.listDocs()); } catch (err) { next(err); }
});

app.delete("/api/documents/:id", requireAuth, async (req, res, next) => {
  try { await db.deleteDoc(req.params.id); res.json({ message: "Deleted" }); } catch (err) { next(err); }
});

// ── Graph ─────────────────────────────────────────────────────────────────────
app.get("/api/graph", requireAuth, async (_req, res, next) => {
  try {
    const docs  = await db.listDocs();
    const nodes = [], links = [], seen = new Map();

    for (const doc of docs) {
      nodes.push({ id: doc.docId, name: doc.name, group: "document" });
      const ent = doc.entities || {};
      const add = (list = [], group) => {
        for (const item of list) {
          const eid = `${group}:${item}`;
          if (!seen.has(eid)) { seen.set(eid, true); nodes.push({ id: eid, name: item, group }); }
          links.push({ source: doc.docId, target: eid });
        }
      };
      add(ent.equipment_tags,    "equipment");
      add(ent.process_parameters,"parameter");
      add(ent.safety_standards,  "safety");
    }
    res.json({ nodes, links });
  } catch (err) { next(err); }
});

// ── Upload ────────────────────────────────────────────────────────────────────
app.post("/api/upload", requireAuth, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ detail: "PDF file required." });

    const docId = `${Date.now()}-${req.file.originalname}`;
    let docRecord = await db.createDoc({
      docId,
      name:       req.file.originalname,
      sizeBytes:  req.file.size,
      status:     "processing",
      uploadedBy: req.user.id,
      entities:   { equipment_tags: [], process_parameters: [], safety_standards: [] },
    });

    // Forward to Python AI engine
    const form = new FormData();
    form.append("file", new Blob([req.file.buffer], { type: "application/pdf" }), req.file.originalname);

    let data;
    try {
      const pythonRes = await fetch(`${PYTHON_API_URL}/upload`, { method: "POST", body: form, signal: AbortSignal.timeout(180_000) });
      data = await readPythonResponse(pythonRes);
    } catch (pyErr) {
      await db.updateDoc(docId, { status: "failed" });
      return next(pyErr);
    }

    docRecord = await db.updateDoc(docId, {
      status:   "indexed",
      entities: data.entities || { equipment_tags: [], process_parameters: [], safety_standards: [] },
    });

    res.status(200).json({ ...data, docRecord });
  } catch (err) { next(err); }
});

// ── AI Query (SSE stream proxy) ───────────────────────────────────────────────
app.post("/api/query", requireAuth, async (req, res, next) => {
  try {
    const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
    if (!query) return res.status(400).json({ detail: "query is required" });

    const pythonRes = await fetch(`${PYTHON_API_URL}/query`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ query }),
      signal:  AbortSignal.timeout(120_000),
    });

    if (!pythonRes.ok) return res.status(pythonRes.status).json(await readPythonResponse(pythonRes));

    res.setHeader("Content-Type",      "text/event-stream");
    res.setHeader("Cache-Control",     "no-cache");
    res.setHeader("Connection",        "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const reader = pythonRes.body.getReader(), dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(dec.decode(value, { stream: true }));
    }
    res.end();
  } catch (err) { next(err); }
});

// ── Compliance ────────────────────────────────────────────────────────────────
app.post("/api/compliance", requireAuth, async (req, res, next) => {
  try {
    const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
    if (!query) return res.status(400).json({ detail: "query is required" });
    const r = await fetch(`${PYTHON_API_URL}/compliance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(120_000) });
    return res.status(r.status).json(await readPythonResponse(r));
  } catch (err) { next(err); }
});

// ── Query History Proxy ────────────────────────────────────────────────────────
app.get("/api/query-history", requireAuth, async (req, res, next) => {
  try {
    const pythonRes = await fetch(`${PYTHON_API_URL}/query-history?limit=50`, { signal: AbortSignal.timeout(5000) });
    const data = await pythonRes.json();
    res.json(data);
  } catch (err) {
    res.json({ queries: [] });
  }
});

// ── Delete Vectors Proxy ───────────────────────────────────────────────────────
app.post("/api/documents/:id/delete-vectors", requireAuth, async (req, res, next) => {
  try {
    const pythonRes = await fetch(`${PYTHON_API_URL}/delete-document`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_name: req.body.source_name }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await pythonRes.json();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError)
    return res.status(400).json({ detail: err.code === "LIMIT_FILE_SIZE" ? "File too large (max 50MB)" : err.message });
  const status = Number.isInteger(err.status) ? err.status : 500;
  console.error(`[Error ${status}]`, err.message);
  return res.status(status).json({ detail: err.message || "Gateway error" });
});

// ── Start ─────────────────────────────────────────────────────────────────────
(async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`\n🚀 DocOps Gateway → http://localhost:${PORT}`);
    console.log(`   AI Backend  → ${PYTHON_API_URL}`);
    console.log(`   Health      → http://localhost:${PORT}/api/health\n`);
  });
})();
