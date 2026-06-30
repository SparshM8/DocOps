import pytest
import os
import sys

# Set Qdrant to run in memory for tests to avoid locking the real directory
os.environ["QDRANT_PATH"] = ":memory:"

from fastapi.testclient import TestClient
from main import app, OFFLINE_MOCK_MODE

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["status"] == "ok"
    assert "llm_model" in data

def test_stats_endpoint():
    response = client.get("/stats")
    assert response.status_code == 200
    data = response.json()
    assert "document_count" in data
    assert "vector_count" in data

def test_generate_report_endpoint():
    response = client.get("/generate-report")
    assert response.status_code == 200
    data = response.json()
    assert "report" in data
    # In both mock mode or real mode, it should return a report string
    assert isinstance(data["report"], str)
    assert len(data["report"]) > 0

def test_graph_endpoint():
    response = client.get("/graph")
    assert response.status_code == 200
    data = response.json()
    assert "nodes" in data
    assert "edges" in data
