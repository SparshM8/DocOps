"use strict";

const express = require("express");
const cors = require("cors");
const multer = require("multer");

const app = express();
const PORT = Number(process.env.PORT || 3001);
const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://localhost:8000";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const isPdf =
      file.mimetype === "application/pdf" ||
      file.originalname.toLowerCase().endsWith(".pdf");
    cb(isPdf ? null : new Error("Only PDF files are supported."), isPdf);
  },
});

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "1mb" }));

function pythonServiceUnavailable(error) {
  return error instanceof TypeError && /fetch failed/i.test(error.message);
}

async function readPythonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : { detail: await response.text() };

  if (!response.ok) {
    const error = new Error(
      body.detail || body.message || `Python API returned ${response.status}`
    );
    error.status = response.status;
    throw error;
  }
  return body;
}

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", python_api: PYTHON_API_URL });
});

// ── Upload PDF ────────────────────────────────────────────────────────────────
app.post("/api/upload", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ detail: "A PDF file is required." });
    }
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([req.file.buffer], {
        type: req.file.mimetype || "application/pdf",
      }),
      req.file.originalname
    );
    const pythonRes = await fetch(`${PYTHON_API_URL}/upload`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(120_000),
    });
    return res.status(pythonRes.status).json(await readPythonResponse(pythonRes));
  } catch (err) {
    return next(err);
  }
});

// ── Query (RAG Chat) ──────────────────────────────────────────────────────────
app.post("/api/query", async (req, res, next) => {
  try {
    const query =
      typeof req.body?.query === "string" ? req.body.query.trim() : "";
    if (!query) {
      return res.status(400).json({ detail: "A non-empty 'query' string is required." });
    }
    const pythonRes = await fetch(`${PYTHON_API_URL}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(90_000),
    });
    return res.status(pythonRes.status).json(await readPythonResponse(pythonRes));
  } catch (err) {
    return next(err);
  }
});

// ── Equipment Tags ────────────────────────────────────────────────────────────
app.get("/api/tags", async (_req, res, next) => {
  try {
    const pythonRes = await fetch(`${PYTHON_API_URL}/tags`, {
      signal: AbortSignal.timeout(15_000),
    });
    return res.status(pythonRes.status).json(await readPythonResponse(pythonRes));
  } catch (err) {
    return next(err);
  }
});

// ── Compliance Check ──────────────────────────────────────────────────────────
app.post("/api/compliance", async (req, res, next) => {
  try {
    const query =
      typeof req.body?.query === "string" ? req.body.query.trim() : "";
    if (!query) {
      return res.status(400).json({ detail: "A non-empty 'query' string is required." });
    }
    const pythonRes = await fetch(`${PYTHON_API_URL}/compliance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(90_000),
    });
    return res.status(pythonRes.status).json(await readPythonResponse(pythonRes));
  } catch (err) {
    return next(err);
  }
});

// ── Error Handler ─────────────────────────────────────────────────────────────
app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const detail =
      error.code === "LIMIT_FILE_SIZE"
        ? "PDF is too large. Maximum size is 50 MB."
        : error.message;
    return res.status(400).json({ detail });
  }
  if (pythonServiceUnavailable(error) || error.name === "TimeoutError") {
    return res.status(503).json({
      detail:
        "The Python AI service is unavailable. Start FastAPI on http://localhost:8000 and try again.",
    });
  }
  const status = Number.isInteger(error.status) ? error.status : 500;
  return res.status(status).json({ detail: error.message || "Unexpected gateway error." });
});

app.listen(PORT, () => {
  console.log(`DocOps API gateway listening on http://localhost:${PORT}`);
  console.log(`Forwarding AI requests to ${PYTHON_API_URL}`);
});
