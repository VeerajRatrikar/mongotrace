const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const {
  connectDB,
  getDB,
  getIsReplicaSet,
  getServerInfo,
  getDBEvents,
  getMongoQueryLogs,
  logMongoOperation
} = require('./services/db');
const {
  createEvidence,
  updateEvidenceWithVersion,
  getEvidenceWithHistory,
  createEvidenceRelation,
  verifyEvidenceHash,
  verifyAllEvidence,
  testTamperEvidence
} = require('./services/evidenceService');
const {
  createInvestigation,
  getInvestigations,
  getInvestigationById,
  updateInvestigation,
  addInvestigationNote,
  getInvestigationAuditTrail
} = require('./services/investigationService');
const {
  parseRawData,
  previewIngestion,
  validateIngestionBatch,
  executeIngestion
} = require('./services/ingestionService');
const {
  getDetectionRules,
  getDerivedFindings,
  runDetectionEngine
} = require('./services/detectionService');
const { reconstructIncident, traceCausalityChain } = require('./services/reconstructionService');
const { analyzeCaseAnomalies } = require('./services/anomalyService');
const {
  uploadEvidenceFile,
  downloadEvidenceFileStream,
  listEvidenceFiles,
  deleteEvidenceFile
} = require('./services/gridfsService');
const { runSchemaBenchmark, getExperimentHistory } = require('./services/benchmarkService');
const { seedCyberScenarios } = require('./data/seedScenarios');

const app = express();
const PORT = process.env.PORT || 5050;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  maxAge: 0
}));

const sseClients = new Set();

function broadcastSSE(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// -------------------------------------------------------------
// EVENT EMITTER HOOKS (Ensures real-time updates on all MongoDB deployments)
// -------------------------------------------------------------
const dbEvents = getDBEvents();
dbEvents.on('EVIDENCE_CREATED', (doc) => broadcastSSE('EVIDENCE_CREATED', doc));
dbEvents.on('EVIDENCE_VERSIONED', (doc) => broadcastSSE('EVIDENCE_VERSIONED', doc));
dbEvents.on('RELATION_CREATED', (doc) => broadcastSSE('RELATION_CREATED', doc));
dbEvents.on('FILE_STORED_IN_GRIDFS', (doc) => broadcastSSE('FILE_STORED_IN_GRIDFS', doc));
dbEvents.on('MQL_LOG', (entry) => broadcastSSE('MQL_QUERY_LOG', entry));

// =============================================================
// API V1 REST ENDPOINTS (MongoTrace Official API)
// =============================================================

// Health
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'MongoTrace Evidence Intelligence Engine',
    timestamp: new Date()
  });
});

app.get('/api/v1/health/database', async (req, res) => {
  try {
    const db = getDB();
    const stats = await db.stats();
    const serverInfo = getServerInfo();
    res.json({
      status: 'connected',
      database: db.databaseName,
      serverVersion: (serverInfo && serverInfo.version) || '8.x',
      collectionsCount: stats.collections,
      storageSizeMB: (stats.storageSize / (1024 * 1024)).toFixed(2),
      isReplicaSet: getIsReplicaSet()
    });
  } catch (err) {
    res.status(503).json({ status: 'disconnected', error: err.message });
  }
});

// Investigations
app.get('/api/v1/investigations', async (req, res) => {
  try {
    const { status, severity, search } = req.query;
    const list = await getInvestigations({ status, severity, search });
    res.json({ success: true, count: list.length, investigations: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/investigations', async (req, res) => {
  try {
    const created = await createInvestigation(req.body, req.body.createdBy || 'Lead-Investigator');
    broadcastSSE('INVESTIGATION_CREATED', created);
    res.status(201).json({ success: true, investigation: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/investigations/:id', async (req, res) => {
  try {
    const inv = await getInvestigationById(req.params.id);
    if (!inv) return res.status(404).json({ success: false, error: 'Investigation not found' });
    res.json({ success: true, investigation: inv });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/v1/investigations/:id', async (req, res) => {
  try {
    const updated = await updateInvestigation(req.params.id, req.body, req.body.actor, req.body.reason);
    if (!updated) return res.status(404).json({ success: false, error: 'Investigation not found' });
    broadcastSSE('INVESTIGATION_UPDATED', updated);
    res.json({ success: true, investigation: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/investigations/:id/notes', async (req, res) => {
  try {
    const { text, author } = req.body;
    if (!text) return res.status(400).json({ success: false, error: 'Note text required' });
    const note = await addInvestigationNote(req.params.id, text, author);
    res.json({ success: true, note });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/investigations/:id/audit', async (req, res) => {
  try {
    const logs = await getInvestigationAuditTrail(req.params.id);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Evidence
app.get('/api/v1/evidence', async (req, res) => {
  try {
    const db = getDB();
    const { investigationId, caseId, severity, artifactType, evidenceType, search, limit = 50, skip = 0 } = req.query;
    const query = {};

    const targetInv = investigationId || caseId;
    if (targetInv && targetInv !== 'ALL') {
      query.$or = [{ investigationId: targetInv }, { caseId: targetInv }];
    }
    if (severity && severity !== 'ALL') {
      query.severity = severity;
    }
    const type = artifactType || evidenceType;
    if (type && type !== 'ALL') {
      query.$or = [{ artifactType: type }, { evidenceType: type }];
    }
    if (search && search.trim()) {
      const s = search.trim();
      query.$or = [
        { title: { $regex: s, $options: 'i' } },
        { description: { $regex: s, $options: 'i' } },
        { evidenceId: { $regex: s, $options: 'i' } },
        { sourceHost: { $regex: s, $options: 'i' } },
        { currentHash: { $regex: s, $options: 'i' } },
        { 'entities.value': { $regex: s, $options: 'i' } }
      ];
    }

    const total = await db.collection('evidence').countDocuments(query);
    const items = await db.collection('evidence').find(query)
      .sort({ timestamp: -1 })
      .skip(parseInt(skip, 10))
      .limit(parseInt(limit, 10))
      .toArray();

    res.json({ success: true, total, count: items.length, evidence: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/evidence', async (req, res) => {
  try {
    const created = await createEvidence(req.body, req.body.createdBy || 'Analyst');
    res.status(201).json({ success: true, evidence: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/evidence/:id', async (req, res) => {
  try {
    const result = await getEvidenceWithHistory(req.params.id);
    if (!result) return res.status(404).json({ success: false, error: 'Evidence not found' });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/v1/evidence/:id', async (req, res) => {
  try {
    const { updateFields, actor, reason } = req.body;
    const result = await updateEvidenceWithVersion(req.params.id, updateFields || {}, actor, reason);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/evidence/:id/versions', async (req, res) => {
  try {
    const db = getDB();
    const versions = await db.collection('evidence_versions').find({ evidenceId: req.params.id }).sort({ version: -1 }).toArray();
    res.json({ success: true, versions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/evidence/:id/audit', async (req, res) => {
  try {
    const db = getDB();
    const logs = await db.collection('audit_logs').find({ evidenceId: req.params.id }).sort({ timestamp: -1 }).toArray();
    res.json({ success: true, auditLogs: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/evidence/:id/verify', async (req, res) => {
  try {
    const result = await verifyEvidenceHash(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ingestion Pipeline
app.post('/api/v1/ingestion/preview', (req, res) => {
  try {
    const { rawContent, format = 'json', fieldMapping } = req.body;
    if (!rawContent) return res.status(400).json({ success: false, error: 'Raw content required' });
    const records = parseRawData(rawContent, format);
    const preview = previewIngestion(records, fieldMapping);
    res.json({ success: true, preview });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/ingestion/jobs', async (req, res) => {
  try {
    const { investigationId, rawContent, format = 'json', fieldMapping, sourceSystem, actor } = req.body;
    if (!investigationId || !rawContent) {
      return res.status(400).json({ success: false, error: 'investigationId and rawContent are required' });
    }
    const rawRecords = parseRawData(rawContent, format);
    const validation = await validateIngestionBatch(investigationId, rawRecords, fieldMapping);
    const result = await executeIngestion(investigationId, validation.validRecords, sourceSystem, actor);
    res.json({ success: true, job: result, validationSummary: { invalid: validation.invalidCount, duplicates: validation.duplicateCount } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/ingestion/jobs', async (req, res) => {
  try {
    const db = getDB();
    const jobs = await db.collection('ingestion_jobs').find({}).sort({ createdAt: -1 }).limit(50).toArray();
    res.json({ success: true, jobs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Timeline & Findings
app.get('/api/v1/investigations/:id/timeline', async (req, res) => {
  try {
    const db = getDB();
    const query = { $or: [{ investigationId: req.params.id }, { caseId: req.params.id }] };
    const timeline = await db.collection('evidence').find(query).sort({ timestamp: 1 }).toArray();
    const anomalies = await analyzeCaseAnomalies(req.params.id);
    res.json({ success: true, timeline, anomalies });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/investigations/:id/findings', async (req, res) => {
  try {
    const findings = await getDerivedFindings(req.params.id);
    res.json({ success: true, findings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/detection-rules', async (req, res) => {
  try {
    const rules = await getDetectionRules();
    res.json({ success: true, rules });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Entities & Relationships
app.get('/api/v1/entities', async (req, res) => {
  try {
    const db = getDB();
    const { entityType, search, investigationId } = req.query;
    const query = {};
    if (entityType && entityType !== 'ALL') query.entityType = entityType;
    if (investigationId) query.investigationIds = investigationId;
    if (search && search.trim()) {
      query.normalizedValue = { $regex: search.trim(), $options: 'i' };
    }
    const entities = await db.collection('entities').find(query).sort({ lastSeen: -1 }).limit(100).toArray();
    res.json({ success: true, count: entities.length, entities });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/relationships', async (req, res) => {
  try {
    const db = getDB();
    const { investigationId } = req.query;
    const query = {};
    if (investigationId) query.$or = [{ investigationId }, { caseId: investigationId }];
    const relationships = await db.collection('relationships').find(query).toArray();
    res.json({ success: true, count: relationships.length, relationships });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Schema Experiments
app.post('/api/v1/experiments', async (req, res) => {
  try {
    const itemCount = parseInt(req.body.itemCount || '1500', 10);
    const iterations = parseInt(req.body.iterations || '10', 10);
    const benchmarkResult = await runSchemaBenchmark(itemCount, iterations);
    res.json({ success: true, experiment: benchmarkResult });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/experiments', async (req, res) => {
  try {
    const history = await getExperimentHistory();
    res.json({ success: true, experiments: history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Integrity Scans
app.post('/api/v1/integrity/verify-all', async (req, res) => {
  try {
    const result = await verifyAllEvidence();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/integrity/test-tamper', async (req, res) => {
  try {
    const { evidenceId } = req.body;
    if (!evidenceId) return res.status(400).json({ success: false, error: 'evidenceId required' });
    const result = await testTamperEvidence(evidenceId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// ROUTES: CASES & RECONSTRUCTION (BACKWARD COMPATIBILITY)
// -------------------------------------------------------------
app.get('/api/cases', async (req, res) => {
  try {
    const db = getDB();
    const t0 = performance.now();
    const cases = await db.collection('cases').find({}).sort({ createdAt: -1 }).toArray();
    const t1 = performance.now();
    logMongoOperation('find', 'cases', {}, t1 - t0, cases.length);

    const enriched = await Promise.all(cases.map(async (c) => {
      const count = await db.collection('evidence').countDocuments({ caseId: c.caseId });
      return { ...c, evidenceCount: count };
    }));

    enriched.sort((a, b) => (b.evidenceCount || 0) - (a.evidenceCount || 0));

    res.json({ success: true, cases: enriched });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/cases', async (req, res) => {
  try {
    const db = getDB();
    const { caseNumber, title, description, severity, threatActor, leadInvestigator } = req.body;
    const caseId = `CASE-${Date.now()}`;
    const newCase = {
      caseId,
      caseNumber: caseNumber || `INC-${Date.now()}`,
      title: title || 'Untitled Incident Investigation',
      description: description || '',
      severity: severity || 'HIGH',
      status: 'UNDER_INVESTIGATION',
      threatActor: threatActor || 'Unknown Adversary',
      leadInvestigator: leadInvestigator || 'SecOps Team',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const t0 = performance.now();
    await db.collection('cases').insertOne(newCase);
    const t1 = performance.now();
    logMongoOperation('insertOne', 'cases', { caseId, title: newCase.title }, t1 - t0, 1);

    broadcastSSE('CASE_CREATED', newCase);
    res.json({ success: true, case: newCase });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/cases/:caseId/reconstruct', async (req, res) => {
  try {
    const { caseId } = req.params;
    const { severity, artifactType, startDate, endDate } = req.query;
    const reconstruction = await reconstructIncident(caseId, {
      severity,
      artifactType,
      startDate,
      endDate
    });
    res.json({ success: true, reconstruction });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/cases/:caseId/anomalies', async (req, res) => {
  try {
    const { caseId } = req.params;
    const anomalies = await analyzeCaseAnomalies(caseId);
    res.json({ success: true, anomalies });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/cases/:caseId/causality/:startEvidenceId', async (req, res) => {
  try {
    const { caseId, startEvidenceId } = req.params;
    const depth = parseInt(req.query.depth || '8', 10);
    const chain = await traceCausalityChain(caseId, startEvidenceId, depth);
    res.json({ success: true, chain });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// ROUTES: EVIDENCE CRUD & ACID VERSIONING
// -------------------------------------------------------------
app.get('/api/evidence/:evidenceId', async (req, res) => {
  try {
    const result = await getEvidenceWithHistory(req.params.evidenceId);
    if (!result) return res.status(404).json({ success: false, error: 'Evidence item not found' });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/evidence', async (req, res) => {
  try {
    const { evidenceData, actor } = req.body;
    if (!evidenceData || !evidenceData.caseId || !evidenceData.title) {
      return res.status(400).json({ success: false, error: 'caseId and title are required.' });
    }
    const created = await createEvidence(evidenceData, actor || 'Forensic-Analyst');
    res.json({ success: true, evidence: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/evidence/:evidenceId', async (req, res) => {
  try {
    const { evidenceId } = req.params;
    const { updateFields, actor, reason } = req.body;
    const result = await updateEvidenceWithVersion(evidenceId, updateFields || {}, actor, reason);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/relations', async (req, res) => {
  try {
    const relation = await createEvidenceRelation(req.body);
    res.json({ success: true, relation });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// ROUTES: GRIDFS FORENSIC EVIDENCE VAULT
// -------------------------------------------------------------
app.post('/api/gridfs/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

    const metadata = {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
      evidenceId: req.body.evidenceId || null,
      caseId: req.body.caseId || null,
      description: req.body.description || 'Forensic artifact',
      uploadedBy: req.body.uploadedBy || 'Forensic-Investigator'
    };

    const result = await uploadEvidenceFile(req.file.buffer, metadata);
    res.json({ success: true, file: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/gridfs/files', async (req, res) => {
  try {
    const { caseId } = req.query;
    const files = await listEvidenceFiles(caseId);
    res.json({ success: true, files });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/gridfs/download/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const stream = downloadEvidenceFileStream(fileId);

    stream.on('file', (file) => {
      res.setHeader('Content-Type', (file.metadata && file.metadata.contentType) || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      if (file.metadata && file.metadata.sha256Checksum) {
        res.setHeader('X-Evidence-SHA256', file.metadata.sha256Checksum);
      }
    });

    stream.on('error', (err) => {
      res.status(404).json({ success: false, error: 'File not found in GridFS: ' + err.message });
    });

    stream.pipe(res);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/gridfs/:fileId', async (req, res) => {
  try {
    const result = await deleteEvidenceFile(req.params.fileId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/cases/reseed', async (req, res) => {
  try {
    const db = getDB();
    await db.collection('evidence').deleteMany({});
    await db.collection('evidence_versions').deleteMany({});
    await db.collection('chain_of_custody').deleteMany({});
    await db.collection('evidence_relations').deleteMany({});
    await db.collection('cases').deleteMany({});
    await seedCyberScenarios(db);
    res.json({ success: true, message: 'All cases and evidence successfully reseeded' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// ROUTES: MONGODB MQL QUERY LOGS & DATABASE STATS
// -------------------------------------------------------------
app.get('/api/mongodb/logs', (req, res) => {
  res.json({
    success: true,
    logs: getMongoQueryLogs()
  });
});

app.get('/api/mongodb/collections', async (req, res) => {
  try {
    const db = getDB();
    const collections = await db.listCollections().toArray();
    const statsList = await Promise.all(collections.map(async (col) => {
      try {
        const stats = await db.command({ collStats: col.name });
        return {
          name: col.name,
          count: stats.count || 0,
          sizeBytes: stats.size || 0,
          storageSizeBytes: stats.storageSize || 0,
          totalIndexSizeBytes: stats.totalIndexSize || 0
        };
      } catch {
        const count = await db.collection(col.name).countDocuments().catch(() => 0);
        return { name: col.name, count, sizeBytes: 0, storageSizeBytes: 0, totalIndexSizeBytes: 0 };
      }
    }));

    res.json({ success: true, collections: statsList });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/mongodb/collection/:name/documents', async (req, res) => {
  try {
    const db = getDB();
    const { name } = req.params;
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const skip = parseInt(req.query.skip || '0', 10);
    let filter = {};
    if (req.query.query && req.query.query.trim()) {
      try {
        filter = JSON.parse(req.query.query);
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid JSON filter' });
      }
    }

    const t0 = performance.now();
    const totalCount = await db.collection(name).countDocuments(filter);
    const docs = await db.collection(name).find(filter).skip(skip).limit(limit).toArray();
    const t1 = performance.now();
    const durationMs = t1 - t0;

    logMongoOperation('find', name, filter, durationMs, docs.length);

    res.json({
      success: true,
      collection: name,
      totalCount,
      count: docs.length,
      limit,
      skip,
      durationMs: parseFloat(durationMs.toFixed(2)),
      documents: docs
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/mongodb/query', async (req, res) => {
  try {
    const db = getDB();
    const { collection: colName, filter = {}, pipeline, action = 'find', limit = 20 } = req.body;
    if (!colName) return res.status(400).json({ success: false, error: 'Collection name is required' });

    const t0 = performance.now();
    let results = [];
    if (action === 'aggregate' && Array.isArray(pipeline)) {
      results = await db.collection(colName).aggregate(pipeline).toArray();
      const t1 = performance.now();
      logMongoOperation('aggregate', colName, { pipelineCount: pipeline.length }, t1 - t0, results.length);
      return res.json({ success: true, count: results.length, durationMs: parseFloat((t1 - t0).toFixed(2)), results });
    } else {
      results = await db.collection(colName).find(filter).limit(Math.min(limit, 100)).toArray();
      const t1 = performance.now();
      logMongoOperation('find', colName, filter, t1 - t0, results.length);
      return res.json({ success: true, count: results.length, durationMs: parseFloat((t1 - t0).toFixed(2)), results });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// ROUTES: SCHEMA BENCHMARK EXPERIMENT ENGINE
// -------------------------------------------------------------
app.post('/api/benchmark/run', async (req, res) => {
  try {
    const itemCount = parseInt(req.body.itemCount || '1500', 10);
    const iterations = parseInt(req.body.iterations || '10', 10);
    const benchmarkResult = await runSchemaBenchmark(itemCount, iterations);
    res.json({ success: true, benchmark: benchmarkResult });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// ROUTES: STATUS & SSE STREAMING
// -------------------------------------------------------------
app.get('/api/status', async (req, res) => {
  try {
    const db = getDB();
    const isReplicaSet = getIsReplicaSet();
    const serverInfo = getServerInfo();
    const stats = await db.stats();
    res.json({
      success: true,
      status: 'ONLINE',
      connectionUri: 'mongodb://127.0.0.1:27017',
      isReplicaSet,
      serverVersion: (serverInfo && serverInfo.version) || '8.x',
      database: db.databaseName,
      collections: stats.collections,
      objects: stats.objects,
      dataSizeMB: (stats.dataSize / (1024 * 1024)).toFixed(2),
      storageSizeMB: (stats.storageSize / (1024 * 1024)).toFixed(2),
      indexes: stats.indexes,
      indexSizeMB: (stats.indexSize / (1024 * 1024)).toFixed(2),
      activeSSEClients: sseClients.size
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/seed', async (req, res) => {
  try {
    await seedCyberScenarios();
    res.json({ success: true, message: 'Scenarios seeded successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);

  res.write(`event: CONNECTED\ndata: ${JSON.stringify({ message: 'Connected to MongoTrace live stream', timestamp: new Date() })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Native Change Streams listener (if running on replica set)
function setupChangeStreams(db) {
  const isReplicaSet = getIsReplicaSet();
  if (!isReplicaSet) return;

  try {
    const evidenceStream = db.collection('evidence').watch([], { fullDocument: 'updateLookup' });
    evidenceStream.on('change', (change) => {
      broadcastSSE('DB_CHANGE_STREAM', {
        operationType: change.operationType,
        documentKey: change.documentKey,
        fullDocument: change.fullDocument,
        timestamp: new Date()
      });
    });
  } catch (err) {
    console.warn('[MongoTrace Stream] Change Stream setup note:', err.message);
  }
}

// -------------------------------------------------------------
// BOOTSTRAP SERVER
// -------------------------------------------------------------
async function startServer() {
  try {
    const { db } = await connectDB();
    await seedCyberScenarios();
    setupChangeStreams(db);

    app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(` MongoTrace Platform is active on: http://localhost:${PORT}`);
      console.log(` Connected to MongoDB: mongodb://127.0.0.1:27017/mongotrace`);
      console.log(`=======================================================`);
    });
  } catch (err) {
    console.error('Failed to start MongoTrace Server:', err);
    process.exit(1);
  }
}

startServer();
