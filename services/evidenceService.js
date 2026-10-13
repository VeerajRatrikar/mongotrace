const crypto = require('crypto');
const { getDB, getClient, getIsReplicaSet, getDBEvents, logMongoOperation } = require('./db');

function calculateHash(payload) {
  const normalized = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Standardizes evidence payload for deterministic canonical SHA-256 calculation
 */
function getCanonicalEvidencePayload(doc) {
  return {
    investigationId: doc.investigationId || doc.caseId || '',
    caseId: doc.caseId || doc.investigationId || '',
    timestamp: doc.timestamp instanceof Date ? doc.timestamp.toISOString() : (doc.timestamp ? new Date(doc.timestamp).toISOString() : ''),
    artifactType: doc.artifactType || doc.evidenceType || 'SECURITY_EVENT',
    severity: doc.severity || 'MEDIUM',
    sourceHost: doc.sourceHost || 'unknown-host',
    title: doc.title || '',
    description: doc.description || '',
    mitreTactic: doc.mitreTactic || '',
    mitreTechnique: doc.mitreTechnique || '',
    metadata: doc.metadata || {},
    entities: (doc.entities || []).map(e => ({ type: e.type, value: e.value })),
    version: doc.version || 1
  };
}

/**
 * Extract entities from polymorphic evidence document (inspects both root & metadata)
 */
function extractEntities(doc) {
  const entities = [];
  const meta = doc.metadata || {};

  const host = doc.sourceHost || doc.host || meta.host || meta.sourceHost;
  if (host) entities.push({ type: 'HOST', value: String(host).toLowerCase() });

  const srcIp = doc.sourceIp || meta.sourceIp || meta.src_ip;
  if (srcIp) entities.push({ type: 'IP', value: String(srcIp) });

  const dstIp = doc.destinationIp || meta.destinationIp || meta.dest_ip;
  if (dstIp) entities.push({ type: 'IP', value: String(dstIp) });

  const remoteIp = doc.remoteIp || meta.remoteIp;
  if (remoteIp) entities.push({ type: 'IP', value: String(remoteIp) });

  const user = doc.user || meta.user || meta.userName || meta.account || meta.username;
  if (user) entities.push({ type: 'USER', value: String(user).toLowerCase() });

  const proc = meta.processName || meta.image || doc.processName;
  if (proc) entities.push({ type: 'PROCESS', value: String(proc) });

  const parentProc = meta.parentProcessName || doc.parentProcessName;
  if (parentProc) entities.push({ type: 'PROCESS', value: String(parentProc) });

  const file = doc.fileName || meta.fileName || meta.filePath || meta.filename;
  if (file) entities.push({ type: 'FILE', value: String(file) });

  const sha = doc.sha256 || meta.sha256;
  if (sha) entities.push({ type: 'HASH', value: String(sha).toLowerCase() });

  const domain = meta.domain || meta.domainName || meta.dnsQuery;
  if (domain) entities.push({ type: 'DOMAIN', value: String(domain).toLowerCase() });

  const seen = new Set();
  const deduped = [];
  for (const ent of entities) {
    const key = `${ent.type}:${ent.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(ent);
    }
  }
  return deduped;
}

/**
 * Insert new evidence item with initial Chain of Custody & Audit entry
 */
async function createEvidence(evidenceData, actor = 'SecOps-Ingest') {
  if (!evidenceData || !evidenceData.title) {
    throw new Error('Evidence title is required.');
  }

  const db = getDB();
  const client = getClient();
  const isReplicaSet = getIsReplicaSet();
  const dbEvents = getDBEvents();

  const timestamp = evidenceData.timestamp ? new Date(evidenceData.timestamp) : new Date();
  const ingestedAt = new Date();
  const evidenceId = evidenceData.evidenceId || `EV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const investigationId = evidenceData.investigationId || evidenceData.caseId || 'INV-2026-DEFAULT';
  const caseId = evidenceData.caseId || investigationId;

  const entities = evidenceData.entities && evidenceData.entities.length > 0 
    ? evidenceData.entities 
    : extractEntities(evidenceData);

  const initialPayload = {
    investigationId,
    caseId,
    timestamp,
    eventTimestamp: timestamp,
    ingestionTimestamp: ingestedAt,
    artifactType: evidenceData.artifactType || evidenceData.evidenceType || 'SECURITY_EVENT',
    evidenceType: evidenceData.evidenceType || evidenceData.artifactType || 'SECURITY_EVENT',
    severity: evidenceData.severity || 'MEDIUM',
    sourceHost: evidenceData.sourceHost || evidenceData.host || 'unknown-host',
    title: evidenceData.title,
    description: evidenceData.description || '',
    mitreTactic: evidenceData.mitreTactic || 'Defense Evasion',
    mitreTechnique: evidenceData.mitreTechnique || '',
    metadata: evidenceData.metadata || {},
    entities,
    version: 1
  };

  const canonicalPayload = getCanonicalEvidencePayload(initialPayload);
  const payloadHash = calculateHash(canonicalPayload);

  const newDoc = {
    ...initialPayload,
    evidenceId,
    currentHash: payloadHash,
    sha256: evidenceData.sha256 || (evidenceData.metadata && evidenceData.metadata.sha256) || payloadHash,
    tags: evidenceData.tags || [],
    gridfsFileId: evidenceData.gridfsFileId || null,
    integrityStatus: 'VERIFIED',
    provenance: evidenceData.provenance || { source: evidenceData.sourceSystem || 'API_INGEST', ingestedBy: actor },
    createdBy: actor,
    createdAt: ingestedAt,
    updatedAt: ingestedAt
  };

  const custodyEntry = {
    custodyId: `COC-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    evidenceId,
    investigationId,
    caseId,
    version: 1,
    action: 'INITIAL_INGESTION',
    actor,
    timestamp: ingestedAt,
    recordedAt: ingestedAt,
    previousHash: 'GENESIS_BLOCK_0000000000000000000000000000000000000000000000000000000000000000',
    currentHash: payloadHash,
    integrityVerified: true,
    signature: calculateHash(`GENESIS:${payloadHash}:${actor}:${newDoc.createdAt.toISOString()}`)
  };

  const auditEntry = {
    logId: `AUDIT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    investigationId,
    evidenceId,
    action: 'EVIDENCE_INGESTED',
    actor,
    timestamp: ingestedAt,
    resultingHash: payloadHash,
    details: { title: newDoc.title, severity: newDoc.severity, artifactType: newDoc.artifactType }
  };

  const versionSnapshot = {
    evidenceId,
    investigationId,
    caseId,
    version: 1,
    snapshot: newDoc,
    modifiedBy: actor,
    reason: 'Initial Ingestion and Preservation',
    timestamp: ingestedAt
  };

  const t0 = performance.now();

  if (isReplicaSet) {
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        await db.collection('evidence').insertOne(newDoc, { session });
        await db.collection('chain_of_custody').insertOne(custodyEntry, { session });
        await db.collection('audit_logs').insertOne(auditEntry, { session });
        await db.collection('evidence_versions').insertOne(versionSnapshot, { session });
      });
    } finally {
      await session.endSession();
    }
  } else {
    await db.collection('evidence').insertOne(newDoc);
    await db.collection('chain_of_custody').insertOne(custodyEntry);
    await db.collection('audit_logs').insertOne(auditEntry);
    await db.collection('evidence_versions').insertOne(versionSnapshot);
  }

  // Populate or update the 'entities' collection
  for (const ent of entities) {
    await db.collection('entities').updateOne(
      { entityType: ent.type, normalizedValue: ent.value },
      {
        $setOnInsert: {
          entityId: `ENT-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          entityType: ent.type,
          normalizedValue: ent.value,
          createdAt: new Date()
        },
        $addToSet: {
          investigationIds: investigationId,
          evidenceIds: evidenceId
        },
        $set: { lastSeen: timestamp }
      },
      { upsert: true }
    );
  }

  // Also auto-generate relationship edges if multiple entities exist
  if (entities.length >= 2) {
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        await db.collection('relationships').updateOne(
          { sourceId: `${entities[i].type}:${entities[i].value}`, targetId: `${entities[j].type}:${entities[j].value}` },
          {
            $setOnInsert: {
              relationshipId: `REL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              sourceId: `${entities[i].type}:${entities[i].value}`,
              targetId: `${entities[j].type}:${entities[j].value}`,
              relationshipType: 'ASSOCIATED_WITH',
              createdAt: new Date()
            },
            $addToSet: {
              investigationIds: investigationId,
              evidenceIds: evidenceId
            }
          },
          { upsert: true }
        );
      }
    }
  }

  // Update investigation evidenceCount
  await db.collection('investigations').updateOne(
    { $or: [{ investigationId }, { caseId }] },
    { $inc: { evidenceCount: 1 }, $set: { updatedAt: new Date() } }
  );

  const t1 = performance.now();
  logMongoOperation('insertOne', 'evidence', { evidenceId: newDoc.evidenceId, investigationId, title: newDoc.title }, t1 - t0, 1);

  dbEvents.emit('EVIDENCE_CREATED', newDoc);
  return newDoc;
}

/**
 * Update and version an existing piece of evidence
 */
async function updateEvidenceWithVersion(evidenceId, updateFields, actor = 'Forensic-Analyst', reason = 'Metadata refinement') {
  const db = getDB();
  const client = getClient();
  const isReplicaSet = getIsReplicaSet();
  const dbEvents = getDBEvents();

  const t0 = performance.now();
  const currentDoc = await db.collection('evidence').findOne({ evidenceId });
  if (!currentDoc) {
    throw new Error(`Evidence with ID ${evidenceId} not found.`);
  }

  const nextVersion = (currentDoc.version || 1) + 1;
  const previousHash = currentDoc.currentHash;

  const updatedMetadata = { ...currentDoc.metadata, ...(updateFields.metadata || {}) };
  const updatedDocData = {
    ...currentDoc,
    ...updateFields,
    metadata: updatedMetadata,
    version: nextVersion,
    updatedAt: new Date()
  };

  updatedDocData.entities = extractEntities(updatedDocData);
  delete updatedDocData._id;

  const canonicalPayload = getCanonicalEvidencePayload(updatedDocData);
  const newPayloadHash = calculateHash(canonicalPayload);

  updatedDocData.currentHash = newPayloadHash;
  updatedDocData.integrityStatus = 'VERIFIED';

  const custodyEntry = {
    custodyId: `COC-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    evidenceId,
    investigationId: currentDoc.investigationId || currentDoc.caseId,
    caseId: currentDoc.caseId,
    version: nextVersion,
    action: 'VERSION_UPDATE',
    actor,
    timestamp: new Date(),
    recordedAt: new Date(),
    previousHash,
    currentHash: newPayloadHash,
    reason,
    integrityVerified: true,
    signature: calculateHash(`${previousHash}:${newPayloadHash}:${actor}:${reason}`)
  };

  const auditEntry = {
    logId: `AUDIT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    investigationId: currentDoc.investigationId || currentDoc.caseId,
    evidenceId,
    action: 'VERSION_UPDATE',
    actor,
    timestamp: new Date(),
    previousHash,
    resultingHash: newPayloadHash,
    reason,
    version: nextVersion
  };

  const versionSnapshot = {
    evidenceId,
    investigationId: currentDoc.investigationId || currentDoc.caseId,
    caseId: currentDoc.caseId,
    version: nextVersion,
    snapshot: updatedDocData,
    modifiedBy: actor,
    reason,
    timestamp: new Date()
  };

  if (isReplicaSet) {
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        await db.collection('evidence').replaceOne({ evidenceId }, updatedDocData, { session });
        await db.collection('chain_of_custody').insertOne(custodyEntry, { session });
        await db.collection('audit_logs').insertOne(auditEntry, { session });
        await db.collection('evidence_versions').insertOne(versionSnapshot, { session });
      });
    } finally {
      await session.endSession();
    }
  } else {
    await db.collection('evidence').replaceOne({ evidenceId }, updatedDocData);
    await db.collection('chain_of_custody').insertOne(custodyEntry);
    await db.collection('audit_logs').insertOne(auditEntry);
    await db.collection('evidence_versions').insertOne(versionSnapshot);
  }

  const t1 = performance.now();
  logMongoOperation('replaceOne', 'evidence', { evidenceId, newVersion: nextVersion, hash: newPayloadHash }, t1 - t0, 1);

  const eventPayload = {
    evidenceId,
    version: nextVersion,
    updatedDoc: updatedDocData,
    custodyEntry
  };
  dbEvents.emit('EVIDENCE_VERSIONED', eventPayload);

  return {
    success: true,
    updatedDoc: updatedDocData,
    version: nextVersion,
    newVersion: nextVersion,
    newHash: newPayloadHash
  };
}

/**
 * Retrieve evidence along with its complete version history and custody chain
 */
async function getEvidenceWithHistory(evidenceId) {
  const db = getDB();
  const t0 = performance.now();

  const evidence = await db.collection('evidence').findOne({ evidenceId });
  if (!evidence) return null;

  const versions = await db.collection('evidence_versions')
    .find({ evidenceId })
    .sort({ version: -1 })
    .toArray();

  const custodyChain = await db.collection('chain_of_custody')
    .find({ evidenceId })
    .sort({ recordedAt: 1 })
    .toArray();

  const auditLogs = await db.collection('audit_logs')
    .find({ evidenceId })
    .sort({ timestamp: -1 })
    .toArray();

  const t1 = performance.now();
  logMongoOperation('find', 'evidence_versions', { evidenceId, versionsCount: versions.length }, t1 - t0, versions.length);

  return { evidence, versions, custodyChain, auditLogs };
}

/**
 * Create causal relation between two evidence items
 */
async function createEvidenceRelation(relationData) {
  const db = getDB();
  const { caseId, investigationId, sourceEvidenceId, targetEvidenceId, relationType } = relationData;

  const relation = {
    caseId: caseId || investigationId || 'DEFAULT',
    investigationId: investigationId || caseId || 'DEFAULT',
    sourceEvidenceId,
    targetEvidenceId,
    relationType: relationType || 'CAUSALLY_PRECEDES',
    confidence: relationData.confidence !== undefined ? relationData.confidence : 0.95,
    description: relationData.description || '',
    detectedBy: relationData.detectedBy || 'Analyst-Rule',
    createdAt: new Date()
  };

  const t0 = performance.now();
  await db.collection('relationships').updateOne(
    { sourceId: sourceEvidenceId, targetId: targetEvidenceId },
    { $set: relation },
    { upsert: true }
  );
  await db.collection('evidence_relations').updateOne(
    { caseId: relation.caseId, sourceEvidenceId, targetEvidenceId },
    { $set: relation },
    { upsert: true }
  );
  const t1 = performance.now();
  logMongoOperation('updateOne (upsert)', 'relationships', { source: sourceEvidenceId, target: targetEvidenceId }, t1 - t0, 1);

  getDBEvents().emit('RELATION_CREATED', relation);
  return relation;
}

/**
 * Recalculate hash of an evidence record and verify integrity
 */
async function verifyEvidenceHash(evidenceId) {
  const db = getDB();
  const doc = await db.collection('evidence').findOne({ evidenceId });
  if (!doc) throw new Error(`Evidence ${evidenceId} not found`);

  const canonicalPayload = getCanonicalEvidencePayload(doc);
  const recomputedHash = calculateHash(canonicalPayload);
  const isMatch = (recomputedHash === doc.currentHash);

  // Update status in MongoDB
  await db.collection('evidence').updateOne(
    { evidenceId },
    { $set: { integrityStatus: isMatch ? 'VERIFIED' : 'TAMPER_DETECTED', lastVerifiedAt: new Date() } }
  );

  return {
    evidenceId,
    isValid: isMatch,
    verified: isMatch,
    currentHash: doc.currentHash,
    recomputedHash,
    timestamp: new Date()
  };
}

/**
 * Verify integrity of ALL evidence items in database
 */
async function verifyAllEvidence() {
  const db = getDB();
  const allDocs = await db.collection('evidence').find({}).toArray();

  let verifiedCount = 0;
  let tamperedCount = 0;
  const violations = [];

  for (const doc of allDocs) {
    const canonicalPayload = getCanonicalEvidencePayload(doc);
    const recomputedHash = calculateHash(canonicalPayload);
    const isMatch = (recomputedHash === doc.currentHash);

    if (isMatch) {
      verifiedCount++;
    } else {
      tamperedCount++;
      violations.push({
        evidenceId: doc.evidenceId,
        title: doc.title,
        expectedHash: doc.currentHash,
        actualHash: recomputedHash,
        version: doc.version
      });
    }

    await db.collection('evidence').updateOne(
      { _id: doc._id },
      { $set: { integrityStatus: isMatch ? 'VERIFIED' : 'TAMPER_DETECTED', lastVerifiedAt: new Date() } }
    );
  }

  return {
    totalChecked: allDocs.length,
    verifiedCount,
    tamperedCount,
    violations,
    scannedAt: new Date()
  };
}

/**
 * Test fixture to simulate controlled tampering on an evidence record
 */
async function testTamperEvidence(evidenceId) {
  const db = getDB();
  const doc = await db.collection('evidence').findOne({ evidenceId });
  if (!doc) throw new Error(`Evidence ${evidenceId} not found`);

  // Intentionally modify payload without re-hashing to trigger tamper detection
  const tamperedTitle = `${doc.title} [TAMPERED_BY_TEST_FIXTURE]`;
  await db.collection('evidence').updateOne(
    { evidenceId },
    { $set: { title: tamperedTitle, integrityStatus: 'TAMPER_DETECTED' } }
  );

  return {
    success: true,
    evidenceId,
    message: 'Controlled tamper injected. Hash mismatch will now be flagged during integrity audits.'
  };
}

module.exports = {
  createEvidence,
  updateEvidenceWithVersion,
  getEvidenceWithHistory,
  createEvidenceRelation,
  verifyEvidenceHash,
  verifyAllEvidence,
  testTamperEvidence,
  extractEntities,
  calculateHash,
  getCanonicalEvidencePayload
};
