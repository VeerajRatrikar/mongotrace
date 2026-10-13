const { connectDB } = require('./services/db');
const { seedCyberScenarios } = require('./data/seedScenarios');

async function inspectMongoDB() {
  const { db } = await connectDB();
  await seedCyberScenarios();

  console.log('=======================================================');
  console.log(' MONGODB DATABASE: mongotrace (127.0.0.1:27017)');
  console.log('=======================================================');

  const requiredCollections = [
    'investigations',
    'evidence',
    'evidence_versions',
    'entities',
    'relationships',
    'ingestion_jobs',
    'audit_logs',
    'detection_rules',
    'derived_findings',
    'evidence_vault.files',
    'evidence_vault.chunks',
    'schema_experiments'
  ];

  for (const name of requiredCollections) {
    try {
      const count = await db.collection(name).countDocuments();
      console.log(`- Collection [${name}]: ${count} documents`);
    } catch (err) {
      console.log(`- Collection [${name}]: (Error: ${err.message})`);
    }
  }

  console.log('\n=== SAMPLE INVESTIGATIONS ===');
  const invs = await db.collection('investigations').find().toArray();
  for (const inv of invs) {
    console.log(`  * [${inv.investigationId}] "${inv.title}" | Severity: ${inv.severity} | Status: ${inv.status}`);
  }

  console.log('\n=== SAMPLE EVIDENCE RECORDS ===');
  const evSample = await db.collection('evidence').find().limit(3).toArray();
  for (const ev of evSample) {
    console.log(`  * [${ev.evidenceId}] "${ev.title}" (v${ev.version}) - Hash: ${ev.currentHash ? ev.currentHash.substring(0, 16) + '...' : 'none'}`);
  }

  process.exit(0);
}

inspectMongoDB().catch(err => {
  console.error('Inspection failed:', err);
  process.exit(1);
});
