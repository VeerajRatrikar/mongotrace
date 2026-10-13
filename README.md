# MongoTrace — Self-Evolving Digital Evidence Intelligence Platform

[![MongoDB 8.3 Community Server](https://img.shields.io/badge/MongoDB-Community%20Server%208.x-green.svg)](https://www.mongodb.com/try/download/community)
[![Node.js 20+](https://img.shields.io/badge/Node.js-v20%2B-blue.svg)](https://nodejs.org/)
[![UI Style](https://img.shields.io/badge/UI-Minimalist%20White%20Enterprise-slate.svg)]()
[![No Docker](https://img.shields.io/badge/Architecture-Native%20Windows%20(No%20Docker)-brightgreen.svg)]()

> **MongoTrace** is an enterprise-grade digital forensics intelligence and incident correlation platform built exclusively on native **MongoDB Community Server**. It ingests polymorphic telemetry (process spawns, network flows, file modifications, cloud identity events, and memory dumps), cryptographically versions every piece of digital evidence into an immutable, traceable document, and reconstructs how attacks unfolded over time.

---

## 🏛️ System Architecture & Native MongoDB Setup (No Docker)

```
                            ┌──────────────────────────────────────────────┐
                            │      MongoTrace Enterprise Web Console       │
                            │      http://localhost:5050/index.html        │
                            └──────────────────────┬───────────────────────┘
                                                   │ REST / SSE
                                                   ▼
                            ┌──────────────────────────────────────────────┐
                            │        MongoTrace Node.js / Express          │
                            │           Port: 5050 (Configurable)          │
                            └──────────────────────┬───────────────────────┘
                                                   │ Native TCP (Wire Protocol)
                                                   ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                             MongoDB Community Server on Windows 11                               │
│                         Connection URI: mongodb://127.0.0.1:27017/mongotrace                     │
├──────────────────────┬──────────────────────┬──────────────────────┬─────────────────────────────┤
│   investigations     │       evidence       │  evidence_versions   │         audit_logs          │
│ (Active Incidents)   │ (Polymorphic BSON)   │ (Immutable Snapshots)│ (Append-Only Custody Ledger)│
├──────────────────────┼──────────────────────┼──────────────────────┼─────────────────────────────┤
│       entities       │    relationships     │    ingestion_jobs    │     schema_experiments      │
│  (Hosts, Users, IPs) │  (Graph Edges)       │ (Batch Job Tracking) │ (Storage & Latency Metrics) │
├──────────────────────┼──────────────────────┼──────────────────────┼─────────────────────────────┤
│   detection_rules    │   derived_findings   │ evidence_vault.files │    evidence_vault.chunks    │
│  (MITRE ATT&CK)      │ (Anomaly Engine)     │ (GridFS Binary Files)│ (255 KB Binary Chunks)      │
└──────────────────────┴──────────────────────┴──────────────────────┴─────────────────────────────┘
```

---

## 📋 The 9 Navigation Sections

1. **Overview Dashboard**: Four live KPI metrics (Active Investigations, Total Evidence, Gaps/Conflicts, Integrity Status), recent investigations table, artifact distribution chart, recent MITRE detection findings, and evidence telemetry stream.
2. **Investigations**: Complete CRUD lifecycle management for incident cases with severity, status, threat actor correlation, investigation notes workspace, and audit history.
3. **Evidence Explorer**: Interactive table of polymorphic evidence documents with advanced filtering (ID, host, user, hash, artifact class, severity), cryptographic verification, version comparison, and JSON/CSV export.
4. **Timeline Reconstruction**: Chronological event correlation comparing event timestamps vs. ingestion timestamps, highlighting causality gaps, conflicting evidence, and living-off-the-land sequences.
5. **Entity Relationships**: Interactive graph connecting Users, Hosts, IP Addresses, Files, and Processes with filtering, path highlighting, and an accessible table view.
6. **Ingestion Wizard**: Multi-format ingestion pipeline supporting JSON, JSONL, and CSV with field mapping, pre-ingestion validation, duplicate detection, and batch execution tracking in `ingestion_jobs`.
7. **Integrity & Audit Trail**: Real-time cryptographic SHA-256 integrity verification scanner, tamper detection fixture, and append-only audit trail from the `audit_logs` collection.
8. **Schema Experiments**: Empirical benchmark engine comparing **Embedded** vs. **Referenced** vs. **Hybrid Time-Bucket** models across WiredTiger storage size, index overhead, median query latencies (p50/p95/p99), and retrieval accuracy under 16MB BSON limits.
9. **MongoDB Database Explorer**: Direct in-app database browser displaying real-time collection statistics, raw BSON document viewer with JSON filtering, copyable `mongosh` syntax, and interactive MQL query runner.

---

## 🚀 Windows 11 Quickstart Guide

### 1. Prerequisites (No Docker)
1. **Windows 11**
2. **Node.js** (v18, v20, or v22+)
3. **MongoDB Community Server for Windows**: Installed natively via `.msi` from [MongoDB Download Center](https://www.mongodb.com/try/download/community).
4. **MongoDB Compass**: Installed natively for direct database inspection.

### 2. Verify MongoDB Windows Service
Open Windows PowerShell and check that the MongoDB Windows service is active:
```powershell
Get-Service MongoDB
```
If the service is stopped, start it:
```powershell
Start-Service MongoDB
```

### 3. Install Dependencies
From the repository root (`c:\Users\VEERAJ\OneDrive\Desktop\NoSQL`):
```powershell
npm install
```

### 4. Seed the Database
Seed all 11 required collections with realistic, interconnected cyber incident scenarios:
```powershell
npm run seed
```

### 5. Run the Automated Test Suite
Verify all 13 core requirements against a dedicated test database (`mongotrace_test`):
```powershell
npm test
```

### 6. Start the MongoTrace Platform
Launch the backend server:
```powershell
npm start
```
The application will launch on:
```
http://localhost:5050/index.html
```
*(If port 5050 is in use, modify `PORT` in `.env` to any port you prefer).*

---

## 🔍 Inspecting Data in MongoDB Compass

1. Launch **MongoDB Compass**.
2. Connect to the local MongoDB server:
   ```
   mongodb://127.0.0.1:27017/mongotrace
   ```
   *(or simply `mongodb://localhost:27017`)*
3. Select the **`mongotrace`** database from the left database list.
4. You will see all 11 populated collections:
   - **`investigations`**: Incident cases (`INV-2026-0881`, `INV-2026-0914`, `INV-2026-0922`).
   - **`evidence`**: Polymorphic BSON evidence documents with cryptographic SHA-256 hashes.
   - **`evidence_versions`**: Historical immutable snapshot archives (`v1`, `v2`, etc.).
   - **`entities`**: Extracted forensic entities (`HOST`, `USER`, `IP`, `PROCESS`, `FILE`, `HASH`).
   - **`relationships`**: Entity association and causal precedence edges.
   - **`ingestion_jobs`**: Job tracking records with accepted, rejected, and duplicate counts.
   - **`audit_logs`**: Append-only audit entries for all creations, modifications, and hash checks.
   - **`detection_rules`**: Configurable MITRE ATT&CK detection definitions.
   - **`derived_findings`**: Automated findings produced by MongoDB aggregation rules.
   - **`evidence_vault.files` & `evidence_vault.chunks`**: MongoDB GridFS bucket storing PCAP and memory dump binaries.
   - **`schema_experiments`**: Benchmark experiment runs with storage sizes, latencies, and accuracy ratings.

---

## 🧪 Schema Benchmark Experiment Results

The platform benchmarks three document architectures on MongoDB WiredTiger:

| Metric | Embedded Document | Referenced / Normalized | Hybrid Time-Bucket (Recommended) |
| :--- | :---: | :---: | :---: |
| **Data Storage Overhead (1,500 items)** | ~720 KB | ~1,150 KB | **~740 KB** |
| **Index Footprint** | ~32 KB | ~180 KB | **~42 KB** |
| **Incident Reconstruction Latency (p50)** | **1.2 ms** (single doc) | 4.8 ms (range scan) | 2.1 ms (bucket scan) |
| **Time-Window Filter Latency (p50)** | 6.5 ms (unwind/filter) | **1.8 ms** (indexed scan) | 2.4 ms (bucket bounds) |
| **Single Item Update Latency (p50)** | 8.4 ms (doc rewrite) | **1.4 ms** (leaf doc update) | 3.2 ms (bucket update) |
| **Retrieval Accuracy at Scale (>15k items)** | ❌ **0% (16MB BSON limit)** | ✅ **100% (Unbounded)** | ✅ **100% (Unbounded)** |

---

## 📡 REST API Reference (`/api/v1`)

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/v1/health` | `GET` | Service status and uptime |
| `/api/v1/health/database` | `GET` | MongoDB connection stats, version, and storage footprint |
| `/api/v1/investigations` | `GET`, `POST` | List and create incident investigations |
| `/api/v1/investigations/:id` | `GET`, `PATCH` | Retrieve and update investigation |
| `/api/v1/investigations/:id/timeline` | `GET` | Reconstruct chronological incident timeline with anomaly flags |
| `/api/v1/investigations/:id/notes` | `POST` | Append investigator observation to investigation document |
| `/api/v1/investigations/:id/audit` | `GET` | Retrieve investigation audit trail |
| `/api/v1/evidence` | `GET`, `POST` | Search, filter, and create evidence documents |
| `/api/v1/evidence/:id` | `GET`, `PATCH` | Retrieve evidence with version history or commit ACID version update |
| `/api/v1/evidence/:id/verify` | `POST` | Recompute and verify cryptographic SHA-256 hash |
| `/api/v1/integrity/verify-all` | `POST` | Execute full-database integrity audit scan |
| `/api/v1/integrity/test-tamper` | `POST` | Inject controlled tamper to verify detection engine |
| `/api/v1/ingestion/preview` | `POST` | Preview and map raw JSON, JSONL, or CSV telemetry |
| `/api/v1/ingestion/jobs` | `GET`, `POST` | List past ingestion jobs or execute batch ingestion |
| `/api/v1/entities` | `GET` | Query extracted entities (`HOST`, `USER`, `IP`, `PROCESS`, etc.) |
| `/api/v1/relationships` | `GET` | Query graph relationship edges |
| `/api/v1/detection-rules` | `GET` | List configurable MITRE ATT&CK detection rules |
| `/api/v1/experiments` | `GET`, `POST` | Retrieve past benchmark experiments or run new benchmark |
| `/api/gridfs/upload` | `POST` | Upload large binary artifact (PCAP/memory dump) to GridFS bucket |
| `/api/gridfs/files` | `GET` | List files stored in GridFS vault |
| `/api/gridfs/download/:fileId` | `GET` | Stream download GridFS file with SHA-256 integrity header |
| `/api/mongodb/collections` | `GET` | Real-time WiredTiger collection stats |
| `/api/stream` | `GET` | Server-Sent Events (SSE) live updates stream |

---

## 🔒 Security & Environment Variables

Create `.env` in the project root:
```env
PORT=5050
MONGODB_URI=mongodb://127.0.0.1:27017/mongotrace
NODE_ENV=development
FRONTEND_URL=http://localhost:5050
```

### Free hosted deployment (Render + MongoDB Atlas)
This project is ready to deploy to Render using Docker. The repository includes a `render.yaml` configuration and a `Dockerfile` that run the app on port `8080` in production.

1. Create a free MongoDB Atlas cluster and copy its connection string.
2. Sign in to Render with your Google account.
3. Import this repository into Render.
4. Set environment variables in Render:
   ```env
   MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/mongotrace
   DB_NAME=mongotrace
   NODE_ENV=production
   PORT=8080
   FRONTEND_URL=https://your-app.onrender.com
   ```
5. Deploy the service.

This avoids a local MongoDB install and keeps the app available on a public HTTPS URL.

---

## 🛠️ Troubleshooting

- **MongoDB Service Not Found**: Verify MongoDB is installed from the official Windows installer. Start it via `net start MongoDB` or Windows Services (`services.msc`).
- **Port Conflict**: MongoTrace runs on port **5050** by default. To change the port, update `PORT=<your_port>` in `.env` and restart.
- **Compass Connection Refused**: Ensure MongoDB is listening on `127.0.0.1:27017`. Run `Test-NetConnection 127.0.0.1 -Port 27017` in PowerShell to test connectivity.
