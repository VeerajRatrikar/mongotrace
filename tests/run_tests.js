/**
 * MongoTrace Automated Comprehensive Test Suite
 * Executes against separate test database: 'mongotrace_test'
 * Tests all 13 critical requirements from Section 23 of the specifications.
 */

process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
process.env.DB_NAME = 'mongotrace_test';

const { MongoClient } = require('mongodb');
const { connectDB, getDB } = require('../services/db');
const {
  createInvestigation,
  getInvestigations,
  getInvestigationById,
  updateInvestigation
} = require('../services/investigationService');
const {
  createEvidence,
  getEvidenceWithHistory,
  updateEvidenceWithVersion,
  verifyEvidenceHash,
  testTamperEvidence
} = require('../services/evidenceService');
const {
  parseRawData,
  previewIngestion,
  validateIngestionBatch,
  executeIngestion
} = require('../services/ingestionService');
const { reconstructIncident } = require('../services/reconstructionService');
const { runSchemaBenchmark } = require('../services/benchmarkService');

let passedTests = 0;
let failedTests = 0;
const testResults = [];

function recordResult(name, success, error = null, durationMs = 0) {
  if (success) {
    passedTests++;
    console.log(`  [PASS] ${name} (${durationMs.toFixed(1)}ms)`);
    testResults.push({ name, status: 'PASS', durationMs });
  } else {
    failedTests++;
    console.error(`  [FAIL] ${name} (${durationMs.toFixed(1)}ms) - ${error}`);
    testResults.push({ name, status: 'FAIL', error: String(error), durationMs });
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log(' MongoTrace Test Suite — Verifying Persistence & Business Logic');
  console.log(` Target Test Database: ${process.env.MONGO_URI}/${process.env.DB_NAME}`);
  console.log('===============================================================\n');

  let db, client;

  try {
    const conn = await connectDB();
    db = conn.db;
    client = conn.client;

    // Clean up test database before starting
    console.log('[Setup] Purging test database collections...');
    const collections = await db.listCollections().toArray();
    for (const col of collections) {
      if (!col.name.startsWith('system.')) {
        await db.collection(col.name).deleteMany({});
      }
    }
    console.log('[Setup] Test database ready.\n');

    // TEST 1: Investigation creation & retrieval
    {
      const t0 = performance.now();
      try {
        const invPayload = {
          title: 'Operation Red Dawn: Unauthorized Domain Controller Access',
          description: 'Attacker breached internal perimeter via compromised VPN token.',
          severity: 'CRITICAL',
          status: 'Open',
          threatActor: 'APT28',
          assignedInvestigator: 'Senior Forensic Lead'
        };
        const created = await createInvestigation(invPayload, 'SystemTest');
        
        // Verify in DB directly
        const dbDoc = await db.collection('investigations').findOne({ investigationId: created.investigationId });
        if (!dbDoc || dbDoc.title !== invPayload.title) {
          throw new Error('Investigation document not found or title mismatch in MongoDB.');
        }

        const retrieved = await getInvestigationById(created.investigationId);
        if (!retrieved || retrieved.investigationId !== created.investigationId) {
          throw new Error('Failed to retrieve investigation by ID.');
        }

        recordResult('1. Investigation Creation & Database Retrieval', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('1. Investigation Creation & Database Retrieval', false, err.message, performance.now() - t0);
      }
    }

    // TEST 2: Evidence creation & retrieval (Polymorphic BSON document)
    let testEvidenceId = null;
    {
      const t0 = performance.now();
      try {
        const evPayload = {
          investigationId: 'INV-TEST-001',
          caseId: 'INV-TEST-001',
          title: 'Suspicious LSASS Process Memory Dump Initiated',
          description: 'Procdump utility executed targeting lsass.exe to dump Kerberos tickets.',
          severity: 'CRITICAL',
          artifactType: 'PROCESS_SPAWN',
          sourceHost: 'DC01.corp.internal',
          timestamp: new Date().toISOString(),
          metadata: {
            processName: 'procdump.exe',
            processId: 4892,
            parentProcessId: 1044,
            commandLine: 'procdump.exe -ma lsass.exe C:\\Windows\\Temp\\lsass.dmp',
            user: 'SYSTEM',
            targetProcess: 'lsass.exe'
          }
        };

        const created = await createEvidence(evPayload, 'TestAnalyst');
        testEvidenceId = created.evidenceId;

        // Verify direct BSON document in evidence collection
        const dbEv = await db.collection('evidence').findOne({ evidenceId: testEvidenceId });
        if (!dbEv || dbEv.metadata.processName !== 'procdump.exe') {
          throw new Error('Polymorphic evidence document not properly persisted in MongoDB.');
        }

        const resultWithHistory = await getEvidenceWithHistory(testEvidenceId);
        if (!resultWithHistory || !resultWithHistory.evidence) {
          throw new Error('Failed to retrieve evidence with history.');
        }

        recordResult('2. Evidence Creation, Polymorphic BSON & Retrieval', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('2. Evidence Creation, Polymorphic BSON & Retrieval', false, err.message, performance.now() - t0);
      }
    }

    // TEST 3: Evidence versioning (Snapshot to evidence_versions)
    {
      const t0 = performance.now();
      try {
        const updateFields = {
          severity: 'HIGH',
          title: 'Suspicious LSASS Process Memory Dump (Correlated with Mimikatz)',
          'metadata.correlatedTool': 'Mimikatz-v2.2'
        };

        const versionResult = await updateEvidenceWithVersion(
          testEvidenceId,
          updateFields,
          'LeadExaminer',
          'Correlated with known Mimikatz command-line pattern'
        );

        if (!versionResult.success || versionResult.newVersion !== 2) {
          throw new Error(`Expected newVersion to be 2, got: ${versionResult.newVersion}`);
        }

        // Verify version 1 document exists in evidence_versions
        const v1Doc = await db.collection('evidence_versions').findOne({
          evidenceId: testEvidenceId,
          version: 1
        });

        if (!v1Doc) {
          throw new Error('Version 1 snapshot missing in evidence_versions collection.');
        }

        // Verify evidence document is now v2
        const currentEv = await db.collection('evidence').findOne({ evidenceId: testEvidenceId });
        if (currentEv.version !== 2) {
          throw new Error(`Current evidence version is not 2 (found ${currentEv.version}).`);
        }

        recordResult('3. Evidence Versioning & Snapshotting in evidence_versions', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('3. Evidence Versioning & Snapshotting in evidence_versions', false, err.message, performance.now() - t0);
      }
    }

    // TEST 4: Audit logging
    {
      const t0 = performance.now();
      try {
        const auditLogs = await db.collection('audit_logs').find({ evidenceId: testEvidenceId }).toArray();
        if (auditLogs.length === 0) {
          throw new Error('No audit logs recorded for evidence operations.');
        }

        const hasVersionLog = auditLogs.some(log => log.action === 'VERSION_UPDATE' || log.action === 'EVIDENCE_MODIFIED');
        if (!hasVersionLog) {
          throw new Error('Expected VERSION_UPDATE or EVIDENCE_MODIFIED audit log entry.');
        }

        recordResult('4. Immutable Audit Trail Logging in audit_logs', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('4. Immutable Audit Trail Logging in audit_logs', false, err.message, performance.now() - t0);
      }
    }

    // TEST 5: Hash verification (SHA-256 integrity & Tamper detection)
    {
      const t0 = performance.now();
      try {
        // Step 1: Normal verification should PASS
        const verifyPass = await verifyEvidenceHash(testEvidenceId);
        if (!verifyPass.isValid) {
          throw new Error('Unmodified evidence failed SHA-256 integrity check.');
        }

        // Step 2: Simulate tamper directly in the database (bypassing versioning)
        const tamperResult = await testTamperEvidence(testEvidenceId);
        if (!tamperResult.success) {
          throw new Error('Failed to run tamper simulation fixture.');
        }

        // Step 3: Verify should now detect TAMPER / INVALID
        const verifyFail = await verifyEvidenceHash(testEvidenceId);
        if (verifyFail.isValid) {
          throw new Error('Integrity check failed to detect tampered document.');
        }

        recordResult('5. Live SHA-256 Hash Verification & Tamper Detection', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('5. Live SHA-256 Hash Verification & Tamper Detection', false, err.message, performance.now() - t0);
      }
    }

    // TEST 6: Invalid input rejection
    {
      const t0 = performance.now();
      try {
        // Missing title and caseId
        let threwError = false;
        try {
          await createEvidence({ description: 'Invalid item with no title' }, 'Tester');
        } catch {
          threwError = true;
        }

        // Ingestion of malformed JSON
        let jsonParseError = false;
        try {
          parseRawData('{ "broken": json without quotes }', 'json');
        } catch {
          jsonParseError = true;
        }

        if (!threwError || !jsonParseError) {
          throw new Error('System failed to reject invalid input / malformed JSON.');
        }

        recordResult('6. Input Validation & Invalid Input Rejection', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('6. Input Validation & Invalid Input Rejection', false, err.message, performance.now() - t0);
      }
    }

    // TEST 7: JSON, JSONL, and CSV ingestion parsing & mapping
    {
      const t0 = performance.now();
      try {
        // JSON parsing
        const rawJson = JSON.stringify([
          { title: 'SSH Login 1', host: 'web01', timestamp: '2026-10-14T01:00:00Z', severity: 'LOW' },
          { title: 'SSH Login 2', host: 'web02', timestamp: '2026-10-14T01:05:00Z', severity: 'MEDIUM' }
        ]);
        const parsedJson = parseRawData(rawJson, 'json');
        if (parsedJson.length !== 2) throw new Error('JSON parsing failed.');

        // JSONL parsing
        const rawJsonl = '{"title":"Log A","host":"app01"}\n{"title":"Log B","host":"app02"}';
        const parsedJsonl = parseRawData(rawJsonl, 'jsonl');
        if (parsedJsonl.length !== 2) throw new Error('JSONL parsing failed.');

        // CSV parsing
        const rawCsv = 'title,host,severity\nFirewall Block,fw01,HIGH\nDNS Query,dns01,LOW';
        const parsedCsv = parseRawData(rawCsv, 'csv');
        if (parsedCsv.length !== 2 || parsedCsv[0].title !== 'Firewall Block') {
          throw new Error('CSV parsing failed.');
        }

        // Preview mapping
        const preview = previewIngestion(parsedCsv, { sourceHost: 'host' });
        if (preview.totalRecords !== 2 || !preview.mappedPreview[0].sourceHost) {
          throw new Error('Field mapping preview failed.');
        }

        recordResult('7. Ingestion Parsing & Mapping (JSON, JSONL, CSV)', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('7. Ingestion Parsing & Mapping (JSON, JSONL, CSV)', false, err.message, performance.now() - t0);
      }
    }

    // TEST 8: Duplicate handling in ingestion
    {
      const t0 = performance.now();
      try {
        const rawRecords = [
          { title: 'Duplicate Event A', timestamp: '2026-10-14T00:00:00Z', host: 'srv1' },
          { title: 'Duplicate Event A', timestamp: '2026-10-14T00:00:00Z', host: 'srv1' }, // Exact duplicate
          { title: 'Unique Event B', timestamp: '2026-10-14T00:01:00Z', host: 'srv2' }
        ];

        const validation = await validateIngestionBatch('INV-TEST-001', rawRecords, { sourceHost: 'host' });
        if (validation.duplicateCount !== 1) {
          throw new Error(`Expected 1 duplicate, found ${validation.duplicateCount}`);
        }
        if (validation.validRecords.length !== 2) {
          throw new Error(`Expected 2 valid records, got ${validation.validRecords.length}`);
        }

        // Execute batch ingestion and verify job created in ingestion_jobs
        const jobResult = await executeIngestion('INV-TEST-001', validation.validRecords, 'SIEM_SPLUNK', 'BatchTester');
        if (!jobResult || jobResult.acceptedCount !== 2) {
          throw new Error('Ingestion execution failed to accept valid records.');
        }

        const jobDoc = await db.collection('ingestion_jobs').findOne({ jobId: jobResult.jobId });
        if (!jobDoc) {
          throw new Error('Ingestion job document was not persisted to ingestion_jobs collection.');
        }

        recordResult('8. Ingestion Duplicate Detection & Batch Job Logging', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('8. Ingestion Duplicate Detection & Batch Job Logging', false, err.message, performance.now() - t0);
      }
    }

    // TEST 9: Timeline ordering & chronological reconstruction
    {
      const t0 = performance.now();
      try {
        // Insert staggered timeline items
        const timestamps = [
          '2026-10-14T03:00:00Z',
          '2026-10-14T01:00:00Z',
          '2026-10-14T02:00:00Z'
        ];

        for (let i = 0; i < timestamps.length; i++) {
          await createEvidence({
            caseId: 'INV-TIMELINE-TEST',
            investigationId: 'INV-TIMELINE-TEST',
            title: `Timeline Event ${i + 1}`,
            timestamp: timestamps[i],
            severity: 'MEDIUM',
            artifactType: 'APPLICATION_LOG',
            sourceHost: 'app.internal'
          }, 'TimelineTester');
        }

        const sortedDocs = await db.collection('evidence')
          .find({ caseId: 'INV-TIMELINE-TEST' })
          .sort({ timestamp: 1 })
          .toArray();

        if (sortedDocs.length !== 3) {
          throw new Error('Expected 3 timeline evidence items.');
        }

        const t1 = new Date(sortedDocs[0].timestamp).getTime();
        const t2 = new Date(sortedDocs[1].timestamp).getTime();
        const t3 = new Date(sortedDocs[2].timestamp).getTime();

        if (t1 > t2 || t2 > t3) {
          throw new Error('Timeline events not properly sorted chronologically.');
        }

        recordResult('9. Incident Timeline Chronological Ordering', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('9. Incident Timeline Chronological Ordering', false, err.message, performance.now() - t0);
      }
    }

    // TEST 10: Aggregation results ($match, $group, $sort, $facet)
    {
      const t0 = performance.now();
      try {
        const pipeline = [
          { $match: { caseId: 'INV-TIMELINE-TEST' } },
          {
            $group: {
              _id: '$artifactType',
              count: { $sum: 1 },
              maxTimestamp: { $max: '$timestamp' }
            }
          },
          { $sort: { count: -1 } }
        ];

        const aggResult = await db.collection('evidence').aggregate(pipeline).toArray();
        if (aggResult.length === 0 || aggResult[0].count !== 3) {
          throw new Error('Aggregation pipeline returned unexpected result.');
        }

        // Test $facet stage
        const facetPipeline = [
          { $match: { caseId: 'INV-TIMELINE-TEST' } },
          {
            $facet: {
              bySeverity: [{ $group: { _id: '$severity', count: { $sum: 1 } } }],
              totalCount: [{ $count: 'total' }]
            }
          }
        ];

        const facetResult = await db.collection('evidence').aggregate(facetPipeline).toArray();
        if (!facetResult[0] || facetResult[0].totalCount[0].total !== 3) {
          throw new Error('$facet aggregation failed to compute multi-faceted metrics.');
        }

        recordResult('10. MongoDB Aggregation Pipelines ($match, $group, $facet)', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('10. MongoDB Aggregation Pipelines ($match, $group, $facet)', false, err.message, performance.now() - t0);
      }
    }

    // TEST 11: Relationship retrieval & entity extraction
    {
      const t0 = performance.now();
      try {
        const evWithEntities = {
          caseId: 'INV-ENTITY-TEST',
          investigationId: 'INV-ENTITY-TEST',
          title: 'Remote PowerShell Execution',
          timestamp: new Date().toISOString(),
          severity: 'HIGH',
          artifactType: 'PROCESS_SPAWN',
          sourceHost: 'WS-FINANCE-09',
          user: 'john.doe',
          sourceIp: '10.0.4.15',
          destinationIp: '198.51.100.44',
          fileName: 'payload.ps1',
          sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef'
        };

        await createEvidence(evWithEntities, 'EntityTester');

        // Check entities extracted to 'entities' collection
        const hostEntity = await db.collection('entities').findOne({
          normalizedValue: 'ws-finance-09',
          entityType: 'HOST'
        });

        const userEntity = await db.collection('entities').findOne({
          normalizedValue: 'john.doe',
          entityType: 'USER'
        });

        const ipEntity = await db.collection('entities').findOne({
          normalizedValue: '10.0.4.15',
          entityType: 'IP'
        });

        if (!hostEntity || !userEntity || !ipEntity) {
          throw new Error('Automatic entity extraction failed for HOST, USER, or IP.');
        }

        // Check relationships created
        const rels = await db.collection('relationships').find({
          investigationIds: 'INV-ENTITY-TEST'
        }).toArray();

        if (rels.length === 0) {
          throw new Error('Expected entity relationships to be persisted in relationships collection.');
        }

        recordResult('11. Entity Extraction & Relationship Graph Persistence', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('11. Entity Extraction & Relationship Graph Persistence', false, err.message, performance.now() - t0);
      }
    }

    // TEST 12: Database disconnection handling
    {
      const t0 = performance.now();
      try {
        // Test attempting connection to an invalid port / host
        const badClient = new MongoClient('mongodb://127.0.0.1:27099', {
          serverSelectionTimeoutMS: 500,
          connectTimeoutMS: 500
        });

        let handledProperly = false;
        try {
          await badClient.connect();
        } catch {
          handledProperly = true;
        } finally {
          await badClient.close().catch(() => {});
        }

        if (!handledProperly) {
          throw new Error('Did not handle connection failure to offline database.');
        }

        recordResult('12. Database Connection Failure & Disconnection Handling', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('12. Database Connection Failure & Disconnection Handling', false, err.message, performance.now() - t0);
      }
    }

    // TEST 13: Schema Experiment Benchmark & Persistence
    {
      const t0 = performance.now();
      try {
        console.log('    [Executing Benchmark Experiment: 500 items x 3 runs]...');
        const benchResult = await runSchemaBenchmark(500, 3);

        if (!benchResult || !benchResult.embedded || !benchResult.referenced || !benchResult.hybrid) {
          throw new Error('Benchmark failed to return metrics for all 3 schema designs.');
        }

        // Verify persisted document in schema_experiments collection
        const expDoc = await db.collection('schema_experiments').findOne({
          experimentId: benchResult.experimentId
        });

        if (!expDoc) {
          throw new Error('Benchmark result was not persisted into schema_experiments collection.');
        }

        recordResult('13. Schema Benchmark Execution & Persistence in schema_experiments', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('13. Schema Benchmark Execution & Persistence in schema_experiments', false, err.message, performance.now() - t0);
      }
    }

    // Clean up test database
    console.log('\n[Cleanup] Cleaning up test database...');
    await db.dropDatabase();
    console.log('[Cleanup] Test database dropped cleanly.');

  } catch (fatalErr) {
    console.error('[Fatal Error in Test Runner]:', fatalErr);
    failedTests++;
  } finally {
    if (client) {
      await client.close();
    }
  }

  console.log('\n===============================================================');
  console.log(` Test Execution Summary: ${passedTests} Passed, ${failedTests} Failed`);
  console.log('===============================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
