const { getDB, logMongoOperation, getDBEvents } = require('./db');

/**
 * Service managing Detection Rules and Derived Findings in MongoDB
 */

async function getDetectionRules() {
  const db = getDB();
  return db.collection('detection_rules').find({}).toArray();
}

async function getDerivedFindings(investigationId = null) {
  const db = getDB();
  const query = {};
  if (investigationId) {
    query.$or = [{ investigationId }, { caseId: investigationId }];
  }
  return db.collection('derived_findings').find(query).sort({ detectionTimestamp: -1 }).toArray();
}

async function runDetectionEngine(investigationId) {
  const db = getDB();
  const t0 = performance.now();

  const query = { $or: [{ investigationId }, { caseId: investigationId }] };
  const evidenceList = await db.collection('evidence').find(query).sort({ timestamp: 1 }).toArray();

  const rules = await db.collection('detection_rules').find({ enabled: true }).toArray();
  const generatedFindings = [];

  for (const rule of rules) {
    if (rule.ruleType === 'SUSPICIOUS_SEQUENCE') {
      // Check if evidence matches sequence of tactics
      const tactics = evidenceList.map(e => e.mitreTactic || '');
      const match = rule.sequence.every(seqTactic => tactics.some(t => t.toLowerCase().includes(seqTactic.toLowerCase())));

      if (match) {
        const supporting = evidenceList.filter(e => rule.sequence.some(seqTactic => (e.mitreTactic || '').toLowerCase().includes(seqTactic.toLowerCase())));
        const findingDoc = {
          findingId: `FIND-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          investigationId,
          caseId: investigationId,
          detectionRuleId: rule.ruleId,
          ruleName: rule.name,
          severity: rule.severity || 'HIGH',
          supportingEvidenceIds: supporting.map(s => s.evidenceId),
          detectionTimestamp: new Date(),
          explanation: rule.description,
          confidence: rule.confidence || 0.90,
          reviewStatus: 'NEW', // NEW, IN_REVIEW, CONFIRMED, FALSE_POSITIVE
          createdAt: new Date()
        };

        await db.collection('derived_findings').updateOne(
          { investigationId, detectionRuleId: rule.ruleId },
          { $set: findingDoc },
          { upsert: true }
        );
        generatedFindings.push(findingDoc);
      }
    } else if (rule.ruleType === 'ANOMALOUS_BURST') {
      // Check for rapid critical events
      const criticals = evidenceList.filter(e => e.severity === 'CRITICAL');
      if (criticals.length >= 2) {
        const findingDoc = {
          findingId: `FIND-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          investigationId,
          caseId: investigationId,
          detectionRuleId: rule.ruleId,
          ruleName: rule.name,
          severity: 'CRITICAL',
          supportingEvidenceIds: criticals.map(c => c.evidenceId),
          detectionTimestamp: new Date(),
          explanation: `Identified ${criticals.length} high-velocity critical alerts within single incident window.`,
          confidence: 0.95,
          reviewStatus: 'NEW',
          createdAt: new Date()
        };

        await db.collection('derived_findings').updateOne(
          { investigationId, detectionRuleId: rule.ruleId },
          { $set: findingDoc },
          { upsert: true }
        );
        generatedFindings.push(findingDoc);
      }
    }
  }

  const t1 = performance.now();
  logMongoOperation('aggregate / find', 'derived_findings', { investigationId, findingsCount: generatedFindings.length }, t1 - t0, generatedFindings.length);

  return generatedFindings;
}

module.exports = {
  getDetectionRules,
  getDerivedFindings,
  runDetectionEngine
};
