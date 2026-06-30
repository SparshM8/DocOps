"""
DocOps Test Data Seeder
=======================
Populates the gateway JSON store with realistic industrial test data:
  - Multiple users (plant managers + field technicians)
  - 10 realistic document records with industrial metadata
  - 30+ audit log entries across different actions
  - Mock vector embeddings in the offline knowledge base

Run from the project root:
    python scripts/seed_data.py
"""

import json
import os
import hashlib
import hmac
import uuid
import random
from datetime import datetime, timedelta
import subprocess
import sys

# ── Paths ──────────────────────────────────────────────────────────────────────
ROOT_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR    = os.path.join(ROOT_DIR, "gateway", "data")
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")
OFFLINE_KB  = os.path.join(BACKEND_DIR, "offline_knowledge_base.jsonl")

os.makedirs(DATA_DIR, exist_ok=True)

# ── Helpers ────────────────────────────────────────────────────────────────────
def hash_password(pwd: str) -> str:
    """PBKDF2-SHA512 — matches gateway/server.js implementation."""
    import hashlib, secrets, binascii
    salt = secrets.token_hex(16)
    dk   = hashlib.pbkdf2_hmac("sha512", pwd.encode(), salt.encode(), 100_000, dklen=64)
    return f"{salt}:{binascii.hexlify(dk).decode()}"

def ts(days_ago=0, hours_ago=0):
    dt = datetime.utcnow() - timedelta(days=days_ago, hours=hours_ago)
    return dt.isoformat() + "Z"

# ── 1. USERS ──────────────────────────────────────────────────────────────────
USERS = [
    {"username": "admin",       "password": "admin123",   "role": "plant_manager"},
    {"username": "raj_manager", "password": "Raj@2024",   "role": "plant_manager"},
    {"username": "anil_tech",   "password": "Tech@1234",  "role": "field_technician"},
    {"username": "priya_ops",   "password": "Priya#2024", "role": "field_technician"},
    {"username": "suresh_eng",  "password": "Suresh@123", "role": "field_technician"},
]

def build_users():
    users = []
    for u in USERS:
        users.append({
            "_id":       str(uuid.uuid4()),
            "username":  u["username"],
            "password":  hash_password(u["password"]),
            "role":      u["role"],
            "createdAt": ts(days_ago=random.randint(10, 60)),
        })
    return users

# ── 2. DOCUMENTS ─────────────────────────────────────────────────────────────
DOC_TEMPLATES = [
    {
        "name": "Reactor_Unit_5_Operations_Manual.pdf",
        "equipment_tags": ["R-501", "P-101", "P-102", "V-201", "HE-301"],
        "process_parameters": ["Temperature", "Pressure", "Flow Rate", "pH Level", "Catalyst Activity"],
        "safety_standards": ["OISD-137", "ATEX Zone-1", "API-520"],
    },
    {
        "name": "Pump_Maintenance_SOP_Rev3.pdf",
        "equipment_tags": ["P-101", "P-102", "P-103", "P-201"],
        "process_parameters": ["Vibration", "Bearing Temperature", "Seal Pressure", "Flow Rate"],
        "safety_standards": ["ISO-13709", "OISD-105", "Factory Act 1948"],
    },
    {
        "name": "OISD_137_Compliance_Framework.pdf",
        "equipment_tags": ["FG-101", "FD-201", "SD-301"],
        "process_parameters": ["Flash Point", "Autoignition Temperature", "LEL", "UEL"],
        "safety_standards": ["OISD-137", "OISD-116", "OISD-118"],
    },
    {
        "name": "HeatExchanger_HE301_RCA_Report.pdf",
        "equipment_tags": ["HE-301", "HE-302", "P-105", "V-102"],
        "process_parameters": ["Shell Temperature", "Tube Pressure", "Fouling Factor", "LMTD"],
        "safety_standards": ["TEMA-R", "ASME Section VIII", "OISD-137"],
    },
    {
        "name": "PID_Distillation_Column_Rev7.png",
        "equipment_tags": ["DC-101", "R-201", "V-305", "P-401", "C-501"],
        "process_parameters": ["Reflux Ratio", "Reboiler Duty", "Overhead Pressure", "Tray Temperature"],
        "safety_standards": ["API-521", "ATEX Zone-2"],
    },
    {
        "name": "Emergency_Shutdown_Procedures.pdf",
        "equipment_tags": ["ESD-001", "PSV-101", "PSV-201", "FG-101"],
        "process_parameters": ["Shutdown Pressure", "Blowdown Rate", "Flare Load"],
        "safety_standards": ["IEC-61511", "OISD-116", "Factory Act 1948"],
    },
    {
        "name": "Compressor_K201_Vibration_Analysis.pdf",
        "equipment_tags": ["K-201", "K-202", "AG-301"],
        "process_parameters": ["Axial Vibration", "Radial Vibration", "Discharge Temperature", "Surge Margin"],
        "safety_standards": ["API-670", "ISO-10816", "OISD-105"],
    },
    {
        "name": "Startup_Shutdown_Checklist_v4.pdf",
        "equipment_tags": ["R-501", "K-201", "P-101", "HE-301", "V-201"],
        "process_parameters": ["Warm-up Rate", "Pressure Ramp", "Feed Flow"],
        "safety_standards": ["OISD-137", "OISD-118", "Factory Act 1948"],
    },
    {
        "name": "Valve_V201_Inspection_Record_2024.pdf",
        "equipment_tags": ["V-201", "V-202", "V-203"],
        "process_parameters": ["Seat Leakage", "Actuator Torque", "Valve Coefficient (Cv)"],
        "safety_standards": ["API-598", "OISD-105"],
    },
    {
        "name": "Nitrogen_Purging_SOP_Vessels.pdf",
        "equipment_tags": ["V-201", "V-305", "R-501"],
        "process_parameters": ["O2 Content", "Dew Point", "Purge Flow Rate", "Final N2 Purity"],
        "safety_standards": ["OISD-116", "Factory Act 1948", "ATEX Zone-1"],
    },
]

def build_documents(users):
    manager_ids = [u["_id"] for u in users if u["role"] == "plant_manager"]
    docs = []
    for i, tmpl in enumerate(DOC_TEMPLATES):
        doc_id = f"{1719000000 + i * 100000}-{tmpl['name']}"
        docs.append({
            "_id":       str(uuid.uuid4()),
            "docId":     doc_id,
            "name":      tmpl["name"],
            "sizeBytes": random.randint(150_000, 4_500_000),
            "status":    "indexed",
            "uploadedBy": random.choice(manager_ids),
            "entities": {
                "equipment_tags":    tmpl["equipment_tags"],
                "process_parameters": tmpl["process_parameters"],
                "safety_standards":   tmpl["safety_standards"],
            },
            "createdAt":  ts(days_ago=random.randint(1, 45)),
            "updatedAt":  ts(days_ago=random.randint(0, 1)),
        })
    return docs

# ── 3. AUDIT LOGS ─────────────────────────────────────────────────────────────
SAMPLE_QUERIES = [
    "What is the startup procedure for Reactor R-501?",
    "Show me the maintenance SOP for Pump P-101",
    "OISD-137 compliance checklist for distillation unit",
    "Root cause analysis for high vibration on K-201 compressor",
    "What are the safety interlocks for heat exchanger HE-301?",
    "Emergency shutdown sequence for reactor unit 5",
    "Bearing temperature alarm setpoints for pumps P-101 and P-102",
    "Nitrogen purging procedure for V-201 vessel",
    "What is the max allowable working pressure for V-305?",
    "Compliance gaps in our current ATEX Zone-1 procedures",
    "How to perform a mechanical seal replacement on P-103?",
    "Reflux ratio setpoints during distillation column startup",
]

def build_audit(users, docs):
    logs = []
    for user in users:
        # Login events
        for day in range(0, 7, 2):
            logs.append({
                "_id":      str(uuid.uuid4()),
                "userId":   user["_id"],
                "username": user["username"],
                "role":     user["role"],
                "action":   "login",
                "status":   "success",
                "createdAt": ts(days_ago=day, hours_ago=random.randint(0, 12)),
            })
        # Query events (technicians and managers)
        for q in random.sample(SAMPLE_QUERIES, k=random.randint(3, 7)):
            logs.append({
                "_id":      str(uuid.uuid4()),
                "userId":   user["_id"],
                "username": user["username"],
                "role":     user["role"],
                "action":   "query",
                "details":  {"query": q},
                "status":   "success",
                "createdAt": ts(days_ago=random.randint(0, 10), hours_ago=random.randint(0, 8)),
            })
    # Upload events (managers only)
    for doc in docs:
        manager = next((u for u in users if u["_id"] == doc["uploadedBy"]), users[0])
        logs.append({
            "_id":      str(uuid.uuid4()),
            "userId":   manager["_id"],
            "username": manager["username"],
            "role":     manager["role"],
            "action":   "upload_doc",
            "details":  {"name": doc["name"]},
            "status":   "success",
            "createdAt": doc["createdAt"],
        })
    # Report generation
    logs.append({
        "_id":      str(uuid.uuid4()),
        "userId":   users[0]["_id"],
        "username": users[0]["username"],
        "role":     "plant_manager",
        "action":   "generate_report",
        "status":   "success",
        "createdAt": ts(days_ago=1),
    })
    return logs

# ── 4. OFFLINE KNOWLEDGE BASE ─────────────────────────────────────────────────
KB_ENTRIES = [
    {"source": "Reactor_Unit_5_Operations_Manual.pdf", "page": 1,  "content": "Reactor R-501 startup procedure: 1. Verify all instrument calibrations. 2. Confirm utility supplies (N2, steam, cooling water). 3. Establish feed flow at 10% capacity. 4. Gradually raise reactor temperature at 5°C/hr. 5. Monitor catalyst bed temperatures. Alarm: High temp > 380°C, Trip > 420°C."},
    {"source": "Reactor_Unit_5_Operations_Manual.pdf", "page": 12, "content": "Process parameters for R-501: Operating Pressure 2.1 - 2.5 MPa. Operating Temperature 320 - 360°C. Feed Flow Rate: 45 - 55 m³/hr. Catalyst: CrMo/Al2O3. Bed differential pressure < 0.15 MPa. High pressure alarm at 2.8 MPa."},
    {"source": "Pump_Maintenance_SOP_Rev3.pdf", "page": 3, "content": "Pump P-101 Mechanical Seal Replacement: 1. Isolate pump, depressurize suction and discharge. 2. Drain casing. 3. Remove coupling guard and disconnect coupling. 4. Remove seal gland bolts. 5. Extract impeller and seal assembly. 6. Inspect shaft for wear. 7. Install new seal cartridge. 8. Torque to 35 Nm. 9. Commission with clean flush fluid first."},
    {"source": "Pump_Maintenance_SOP_Rev3.pdf", "page": 7, "content": "P-101 Vibration Alarm Limits: Bearing housing vibration (radial) > 4.5 mm/s RMS = WARNING, > 7.1 mm/s RMS = TRIP. Bearing temperature: WARNING > 80°C, TRIP > 95°C. Seal leakage: > 10 drops/min requires investigation."},
    {"source": "OISD_137_Compliance_Framework.pdf", "page": 1, "content": "OISD Standard 137 - Static Electricity. Key requirements: 1. All equipment in flammable areas must be bonded and grounded. 2. Resistance to ground < 10 Ohms. 3. Bonding cables to be inspected quarterly. 4. Anti-static footwear mandatory in Zone-1 areas. 5. Tanker loading and unloading: flow velocity < 1 m/s initial, < 3 m/s thereafter."},
    {"source": "OISD_137_Compliance_Framework.pdf", "page": 5, "content": "OISD-137 Compliance Gaps commonly found: Inadequate bonding at flexible hose connections, missing grounding inspection records, sampling points without anti-static sampling cans, improper personal grounding procedures, flow velocity exceeding limits during initial stages of tank loading."},
    {"source": "HeatExchanger_HE301_RCA_Report.pdf", "page": 2, "content": "RCA for HE-301 failure (2024): Root Cause - Fouling due to iron sulfide deposits on tube side from H2S + iron corrosion. Contributing factors: 1. Corrosion inhibitor dosing was inadequate (50% of design dose). 2. Velocity < 1 m/s allowing deposition. Corrective Actions: Increase inhibitor dose to 15 ppm, raise velocity to 1.8 m/s minimum, inspect quarterly."},
    {"source": "Emergency_Shutdown_Procedures.pdf", "page": 1, "content": "ESD Sequence for Reactor Unit 5: Level 1 (Operator initiated) - Stop feed pumps P-101/P-102, open bypass. Level 2 (Automatic on high pressure > 3.0 MPa) - Activate ESD-001, close feed isolation valves, open vent to flare. Level 3 (Fire/Gas) - Full area shutdown, close all block valves, initiate N2 purge. Time to safe state: Level 3 < 90 seconds."},
    {"source": "Compressor_K201_Vibration_Analysis.pdf", "page": 4, "content": "K-201 Compressor Vibration Analysis (June 2024): Dominant frequency at 1X and 2X running speed. Bearing #3 (drive end) shows 6.2 mm/s velocity amplitude. Diagnosis: Rotor imbalance likely due to deposit buildup on impeller. Recommendation: Shutdown and perform online washing with isopropanol, re-balance if washing unsuccessful."},
    {"source": "Startup_Shutdown_Checklist_v4.pdf", "page": 2, "content": "Pre-startup Safety Checklist: ☐ All PTW (Permit to Work) cleared. ☐ Blinds removed and gaskets confirmed. ☐ PSV set pressures verified (PSV-101: 3.5 MPa, PSV-201: 2.8 MPa). ☐ Control valve stroke tests complete. ☐ ESD function tested. ☐ Fire and gas detectors calibrated. ☐ Communication radios charged. ☐ Emergency eyewash and shower stations tested."},
    {"source": "Nitrogen_Purging_SOP_Vessels.pdf", "page": 1, "content": "Nitrogen Purging Procedure for V-201: 1. Isolate vessel from process. 2. Connect N2 supply at top nozzle. 3. Open low-point drain/vent. 4. Purge with 3 vessel volumes of N2 minimum. 5. Measure O2 at outlet: Target < 0.5% v/v for welding work, < 2% v/v for inspection. 6. Maintain 50 mbar positive N2 pressure during work. 7. Log O2 readings every 30 minutes."},
    {"source": "Valve_V201_Inspection_Record_2024.pdf", "page": 1, "content": "V-201 Gate Valve Inspection (April 2024): Seat leakage test: 2 drops/min (PASS, limit: < 6 drops/min per API 598 Class VI). Actuator torque: 180 Nm (design: 200 Nm, PASS). Packing: Replaced with graphite packing rings (PTFE previously). Body: No wall thinning detected. NDT UT thickness: Min 18.2 mm (required: 16 mm, PASS). Status: Returned to service."},
]

def build_offline_kb():
    lines = []
    for entry in KB_ENTRIES:
        lines.append(json.dumps({
            "page_content": entry["content"],
            "metadata": {"source": entry["source"], "page": entry["page"]},
        }))
    return "\n".join(lines)

# ── 5. QUERY HISTORY LOG ──────────────────────────────────────────────────────
def build_query_history():
    lines = []
    for q in SAMPLE_QUERIES:
        lines.append(json.dumps({
            "query": q,
            "timestamp": ts(days_ago=random.randint(0, 14), hours_ago=random.randint(0, 12)),
            "response_tokens": random.randint(120, 800),
            "model": "llama3.2",
        }))
    return "\n".join(lines)

# ── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    # Force UTF-8 output on Windows
    import sys, io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

    print("\n[SEED] DocOps Data Seeder")
    print("=" * 50)

    # 1. Users
    users = build_users()
    with open(os.path.join(DATA_DIR, "users.json"), "w") as f:
        json.dump(users, f, indent=2)
    print(f"[OK] Created {len(users)} users")
    for u in users:
        original = next(x for x in USERS if x["username"] == u["username"])
        print(f"     {u['username']:20s} | role: {u['role']:20s} | password: {original['password']}")

    # 2. Documents
    docs = build_documents(users)
    with open(os.path.join(DATA_DIR, "documents.json"), "w") as f:
        json.dump(docs, f, indent=2)
    print(f"\n[OK] Created {len(docs)} indexed documents")
    for d in docs:
        print(f"     {d['name']}")

    # 3. Audit Logs
    audit = build_audit(users, docs)
    with open(os.path.join(DATA_DIR, "audit.json"), "w") as f:
        json.dump(audit, f, indent=2)
    print(f"\n[OK] Created {len(audit)} audit log entries")

    # 4. Offline Knowledge Base
    kb = build_offline_kb()
    with open(OFFLINE_KB, "w", encoding="utf-8") as f:
        f.write(kb)
    print(f"\n[OK] Created offline knowledge base with {len(KB_ENTRIES)} chunks")
    print(f"     Path: {OFFLINE_KB}")

    # 5. Query History
    qh_path = os.path.join(BACKEND_DIR, "query_history.jsonl")
    with open(qh_path, "w", encoding="utf-8") as f:
        f.write(build_query_history())
    print(f"\n[OK] Created query history log ({len(SAMPLE_QUERIES)} entries)")

    print("\n" + "=" * 50)
    print("[DONE] Seeding complete! Your test credentials:\n")
    print("  Plant Manager:   admin          / admin123")
    print("  Plant Manager:   raj_manager    / Raj@2024")
    print("  Field Tech:      anil_tech      / Tech@1234")
    print("  Field Tech:      priya_ops      / Priya#2024")
    print("  Field Tech:      suresh_eng     / Suresh@123")
    print("\n  NOTE: Restart the Gateway after seeding:")
    print("  cd gateway && node server.js")
    print("=" * 50 + "\n")

if __name__ == "__main__":
    main()
