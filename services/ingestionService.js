const { getDB, logMongoOperation, getDBEvents } = require('./db');
const { createEvidence } = require('./evidenceService');

/**
 * Parses raw text or buffer input into JavaScript objects
 * Supports JSON, JSONL, and CSV
 */
function parseRawData(content, format = 'json') {
  if (typeof content !== 'string') {
    content = content.toString('utf-8');
  }

  format = format.toLowerCase();
  const trimmed = content.trim();

  if (format === 'json' || trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // Fallback to JSONL if JSON parse fails
      return parseJsonLines(trimmed);
    }
  } else if (format === 'jsonl') {
    return parseJsonLines(trimmed);
  } else if (format === 'csv') {
    return parseCSV(trimmed);
  }

  throw new Error(`Unsupported ingestion format: ${format}`);
}

function parseJsonLines(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  return lines.map((line, idx) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      throw new Error(`Invalid JSONL at line ${idx + 1}: ${err.message}`);
    }
  });
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const rawCols = lines[i].split(',');
    const obj = {};
    headers.forEach((h, colIdx) => {
      let val = rawCols[colIdx] ? rawCols[colIdx].trim().replace(/^["']|["']$/g, '') : '';
      obj[h] = val;
    });
    rows.push(obj);
  }
  return rows;
}

/**
 * Preview and inspect incoming records
 */
function previewIngestion(rawRecords, fieldMapping = {}) {
  const sample = rawRecords.slice(0, 5);
  const detectedKeys = new Set();
  rawRecords.forEach(r => Object.keys(r).forEach(k => detectedKeys.add(k)));

  const mappedPreview = sample.map(raw => {
    return {
      title: raw[fieldMapping.title || 'title'] || raw.title || raw.name || '',
      sourceHost: raw[fieldMapping.sourceHost || 'sourceHost'] || raw.sourceHost || raw.host || '',
      timestamp: raw[fieldMapping.timestamp || 'timestamp'] || raw.timestamp || new Date(),
      severity: raw[fieldMapping.severity || 'severity'] || raw.severity || 'MEDIUM',
      artifactType: raw[fieldMapping.artifactType || 'artifactType'] || raw.artifactType || 'SECURITY_EVENT'
    };
  });

  return {
    totalRecords: rawRecords.length,
    detectedFields: Array.from(detectedKeys),
    sample,
    mappedPreview,
    recommendedMapping: {
      timestamp: ['timestamp', 'time', 'date', '@timestamp', 'event_time', 'datetime'].find(k => detectedKeys.has(k)) || 'timestamp',
      title: ['title', 'name', 'event_name', 'message', 'alert_name'].find(k => detectedKeys.has(k)) || 'title',
      severity: ['severity', 'level', 'priority'].find(k => detectedKeys.has(k)) || 'severity',
      artifactType: ['artifactType', 'evidenceType', 'type', 'category'].find(k => detectedKeys.has(k)) || 'artifactType',
      sourceHost: ['sourceHost', 'host', 'hostname', 'computer_name', 'source_host'].find(k => detectedKeys.has(k)) || 'sourceHost',
      description: ['description', 'desc', 'summary', 'details'].find(k => detectedKeys.has(k)) || 'description'
    }
  };
}

/**
 * Validate records and detect duplicates/conflicts against MongoDB
 */
async function validateIngestionBatch(investigationId, rawRecords, fieldMapping = {}) {
  const db = getDB();
  const validRecords = [];
  const invalidRecords = [];
  const duplicates = [];

  // Query existing items in the investigation to identify duplicates
  const existingEvidence = await db.collection('evidence')
    .find({ $or: [{ investigationId }, { caseId: investigationId }] }, { projection: { evidenceId: 1, currentHash: 1, title: 1, sourceHost: 1, timestamp: 1 } })
    .toArray();
  const existingKeys = new Set(existingEvidence.map(e => `${e.title}|${e.sourceHost}`));

  const seenInBatch = new Set();

  for (let i = 0; i < rawRecords.length; i++) {
    const raw = rawRecords[i];
    const errors = [];

    // Map fields
    const title = raw[fieldMapping.title || 'title'] || raw.title || raw.name || raw.event_name;
    const timestampRaw = raw[fieldMapping.timestamp || 'timestamp'] || raw.timestamp || raw['@timestamp'] || raw.time;
    const severity = (raw[fieldMapping.severity || 'severity'] || raw.severity || 'MEDIUM').toUpperCase();
    const artifactType = (raw[fieldMapping.artifactType || 'artifactType'] || raw.artifactType || 'SECURITY_EVENT').toUpperCase();
    const sourceHost = raw[fieldMapping.sourceHost || 'sourceHost'] || raw.sourceHost || raw.host || 'unknown-host';
    const description = raw[fieldMapping.description || 'description'] || raw.description || '';

    if (!title) errors.push('Missing required title/event name');

    let parsedDate = new Date();
    if (timestampRaw) {
      parsedDate = new Date(timestampRaw);
      if (isNaN(parsedDate.getTime())) {
        errors.push(`Invalid timestamp format: ${timestampRaw}`);
      }
    }

    // Check duplicate
    const dedupeKey = `${title}|${sourceHost}|${timestampRaw || ''}`;
    if (seenInBatch.has(dedupeKey) || existingKeys.has(`${title}|${sourceHost}`)) {
      duplicates.push({ index: i, record: raw, reason: 'Duplicate event detected in batch or existing database' });
      continue;
    }
    seenInBatch.add(dedupeKey);

    const canonicalRecord = {
      investigationId,
      caseId: investigationId,
      title: title || 'Untitled Record',
      timestamp: parsedDate,
      severity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity) ? severity : 'MEDIUM',
      artifactType,
      sourceHost,
      description,
      metadata: { ...raw },
      rawIndex: i
    };

    if (errors.length > 0) {
      invalidRecords.push({ index: i, record: raw, errors });
    } else {
      validRecords.push(canonicalRecord);
    }
  }

  return {
    total: rawRecords.length,
    validCount: validRecords.length,
    invalidCount: invalidRecords.length,
    duplicateCount: duplicates.length,
    validRecords,
    invalidRecords,
    duplicates
  };
}

/**
 * Execute actual batch ingestion and persist to MongoDB
 */
async function executeIngestion(investigationId, canonicalRecords, sourceSystem = 'MANUAL_IMPORT', actor = 'SecOps-Ingest') {
  const db = getDB();
  const t0 = performance.now();
  const jobId = `JOB-2026-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const now = new Date();

  // Create Ingestion Job record in 'ingestion_jobs'
  const jobDoc = {
    jobId,
    investigationId,
    sourceSystem,
    status: 'PROCESSING',
    totalRecords: canonicalRecords.length,
    acceptedCount: 0,
    rejectedCount: 0,
    duplicateCount: 0,
    createdAt: now,
    createdBy: actor
  };
  await db.collection('ingestion_jobs').insertOne(jobDoc);

  const ingestedEvidence = [];
  let accepted = 0;
  let rejected = 0;

  for (const rec of canonicalRecords) {
    try {
      const created = await createEvidence({
        ...rec,
        investigationId,
        caseId: investigationId,
        provenance: { source: sourceSystem, jobId, ingestedBy: actor }
      }, actor);
      ingestedEvidence.push(created);
      accepted++;
    } catch {
      rejected++;
    }
  }

  const t1 = performance.now();
  const durationMs = Number((t1 - t0).toFixed(2));

  // Update Ingestion Job
  await db.collection('ingestion_jobs').updateOne(
    { jobId },
    {
      $set: {
        status: rejected === 0 ? 'COMPLETED' : 'COMPLETED_WITH_WARNINGS',
        acceptedCount: accepted,
        rejectedCount: rejected,
        durationMs,
        completedAt: new Date()
      }
    }
  );

  logMongoOperation('insertMany (batched)', 'evidence', { jobId, accepted, rejected }, durationMs, accepted);

  getDBEvents().emit('INGESTION_JOB_COMPLETED', { jobId, investigationId, accepted, rejected });

  return {
    jobId,
    status: 'COMPLETED',
    totalRecords: canonicalRecords.length,
    acceptedCount: accepted,
    rejectedCount: rejected,
    durationMs,
    ingestedEvidence: ingestedEvidence.slice(0, 5)
  };
}

module.exports = {
  parseRawData,
  previewIngestion,
  validateIngestionBatch,
  executeIngestion
};
