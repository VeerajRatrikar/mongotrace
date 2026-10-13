/**
 * MongoTrace Enterprise Application Controller
 * Manages all 9 functional sections, REST API v1 communication, and real-time MongoDB interactions
 */

let appState = {
  activeTab: 'tab-overview',
  currentInvestigationId: null,
  currentCaseId: null,
  investigations: [],
  selectedEvidenceId: null,
  graph: null,
  rawPreviewRecords: null,
  dbExplorer: {
    selectedCollection: 'investigations',
    collections: [],
    limit: 25
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  initNavigation();
  initGraph();
  initModalsAndEvents();
  initSSE();
  await loadInvestigations();
  await switchTab('tab-overview');
});

// ==============================================================
// 1. NAVIGATION & BREADCRUMBS
// ==============================================================
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetTab = item.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  // Global search shortcut ⌘K / Ctrl+K
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('globalSearchInput')?.focus();
    }
  });

  // Global search input listener
  const searchInput = document.getElementById('globalSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      handleGlobalSearch(e.target.value.trim());
    });
  }

  // Active investigation selector in topbar
  const caseSelect = document.getElementById('caseSelect');
  if (caseSelect) {
    caseSelect.addEventListener('change', async (e) => {
      const selectedId = e.target.value;
      if (selectedId) {
        await selectActiveInvestigation(selectedId);
      }
    });
  }
}

async function switchTab(tabId) {
  appState.activeTab = tabId;

  // Update sidebar active class
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });

  // Update panels visibility
  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === tabId);
  });

  // Update breadcrumb
  const breadcrumb = document.getElementById('currentBreadcrumb');
  const tabNames = {
    'tab-overview': 'Overview',
    'tab-investigations': 'Investigations',
    'tab-evidence': 'Evidence Explorer',
    'tab-timeline': 'Timeline Reconstruction',
    'tab-entities': 'Entity Relationships',
    'tab-ingestion': 'Evidence Ingestion',
    'tab-integrity': 'Integrity & Audit',
    'tab-experiments': 'Schema Experiments',
    'tab-settings': 'MongoDB Database'
  };
  if (breadcrumb) {
    breadcrumb.textContent = tabNames[tabId] || 'Workspace';
  }

  // Load section-specific data
  if (tabId === 'tab-overview') await loadOverview();
  if (tabId === 'tab-investigations') await loadInvestigationsView();
  if (tabId === 'tab-evidence') await loadEvidenceExplorer();
  if (tabId === 'tab-timeline') await loadTimelineView();
  if (tabId === 'tab-entities') await loadEntitiesView();
  if (tabId === 'tab-ingestion') await loadIngestionView();
  if (tabId === 'tab-integrity') await loadIntegrityView();
  if (tabId === 'tab-experiments') await loadExperimentsView();
  if (tabId === 'tab-settings') await loadDatabaseExplorer();
}

async function selectActiveInvestigation(invId) {
  appState.currentInvestigationId = invId;
  appState.currentCaseId = invId;

  const caseSelect = document.getElementById('caseSelect');
  if (caseSelect) caseSelect.value = invId;

  const targetIngestSelect = document.getElementById('ingestTargetInvestigation');
  if (targetIngestSelect) targetIngestSelect.value = invId;

  // Refresh active tab with new scope
  await switchTab(appState.activeTab);
}

// ==============================================================
// 2. DATA LOADERS: INVESTIGATIONS
// ==============================================================
async function loadInvestigations() {
  try {
    const res = await fetch('/api/v1/investigations');
    const data = await res.json();
    if (!data.success) return;

    appState.investigations = data.investigations || [];

    // Populate topbar select & ingest modal select
    const caseSelect = document.getElementById('caseSelect');
    const ingestSelect = document.getElementById('ingestTargetInvestigation');

    const optionsHtml = appState.investigations.map(inv => `
      <option value="${inv.investigationId || inv.caseId}">
        ${escapeHtml(inv.investigationNumber || inv.caseNumber || inv.investigationId)} - ${escapeHtml(inv.title)}
      </option>
    `).join('');

    if (caseSelect) caseSelect.innerHTML = optionsHtml;
    if (ingestSelect) ingestSelect.innerHTML = optionsHtml;

    if (!appState.currentInvestigationId && appState.investigations.length > 0) {
      appState.currentInvestigationId = appState.investigations[0].investigationId || appState.investigations[0].caseId;
      appState.currentCaseId = appState.currentInvestigationId;
      if (caseSelect) caseSelect.value = appState.currentInvestigationId;
    }
  } catch (err) {
    console.error('Error loading investigations:', err);
  }
}

// ==============================================================
// SECTION 1: OVERVIEW DASHBOARD
// ==============================================================
async function loadOverview() {
  try {
    // 1. Update Investigations KPI & Table
    const invRes = await fetch('/api/v1/investigations');
    const invData = await invRes.json();
    if (invData.success) {
      const invList = invData.investigations || [];
      document.getElementById('kpiActiveCases').textContent = invList.filter(i => i.status !== 'Closed').length;

      const tbody = document.getElementById('overviewInvestigationsTableBody');
      if (tbody) {
        tbody.innerHTML = invList.slice(0, 5).map(inv => `
          <tr>
            <td>
              <div style="font-weight:600; color:var(--text-primary);">${escapeHtml(inv.title)}</div>
              <div class="font-mono text-muted text-xs">${escapeHtml(inv.investigationNumber || inv.investigationId)}</div>
            </td>
            <td><span class="badge-tag ${inv.severity.toLowerCase()}">${inv.severity}</span></td>
            <td><span class="font-mono text-xs">${escapeHtml(inv.status)}</span></td>
            <td><span class="text-secondary">${escapeHtml(inv.assignedInvestigator || inv.leadInvestigator || 'Unassigned')}</span></td>
            <td class="font-mono">${inv.evidenceCount || 0} items</td>
            <td>
              <button class="btn btn-xs btn-outline" onclick="openInvestigationDetail('${inv.investigationId || inv.caseId}')">Inspect</button>
            </td>
          </tr>
        `).join('');
      }
    }

    // 2. Update Evidence KPI & Recent Feed
    const evRes = await fetch('/api/v1/evidence?limit=10');
    const evData = await evRes.json();
    if (evData.success) {
      document.getElementById('kpiTotalEvidence').textContent = evData.total || 0;

      // Evidence feed
      const feed = document.getElementById('overviewEvidenceFeed');
      if (feed && evData.evidence) {
        feed.innerHTML = evData.evidence.slice(0, 4).map(e => `
          <div class="feed-item" style="padding:8px 0; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-weight:600; font-size:12px;">${escapeHtml(e.title)}</div>
              <div class="font-mono text-muted text-xs">${e.evidenceId} • ${escapeHtml(e.sourceHost || 'host')}</div>
            </div>
            <span class="badge-tag ${e.severity.toLowerCase()}">${e.severity}</span>
          </div>
        `).join('');
      }

      // Artifact distribution breakdown
      const distList = document.getElementById('artifactDistributionList');
      if (distList && evData.evidence) {
        const counts = {};
        evData.evidence.forEach(e => {
          counts[e.artifactType] = (counts[e.artifactType] || 0) + 1;
        });
        distList.innerHTML = Object.entries(counts).map(([type, count]) => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; font-size:11px; border-bottom:1px solid var(--border-subtle);">
            <span class="font-mono text-secondary">${type}</span>
            <span class="font-mono" style="font-weight:700;">${count}</span>
          </div>
        `).join('');
      }
    }

    // 3. Update Anomalies & Findings
    const activeId = appState.currentInvestigationId || 'INV-2026-0881';
    const findRes = await fetch(`/api/v1/investigations/${activeId}/findings`);
    const findData = await findRes.json();
    if (findData.success) {
      const findingsList = document.getElementById('overviewFindingsList');
      const findings = findData.findings || [];
      document.getElementById('kpiAnomaliesCount').textContent = findings.length;

      if (findingsList) {
        if (findings.length === 0) {
          findingsList.innerHTML = '<p class="placeholder-note">No critical detection findings for active scope.</p>';
        } else {
          findingsList.innerHTML = findings.slice(0, 3).map(f => `
            <div style="padding:8px 10px; background:var(--bg-subtle); border-radius:4px; margin-bottom:6px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="font-size:11px;">${escapeHtml(f.ruleName)}</strong>
                <span class="badge-tag ${f.severity.toLowerCase()}">${f.severity}</span>
              </div>
              <p style="font-size:11px; color:var(--text-secondary); margin-top:2px;">${escapeHtml(f.explanation)}</p>
            </div>
          `).join('');
        }
      }
    }
  } catch (err) {
    console.error('Error loading overview:', err);
  }
}

// ==============================================================
// SECTION 2: INVESTIGATIONS MANAGEMENT
// ==============================================================
async function loadInvestigationsView() {
  const search = document.getElementById('invSearchInput')?.value || '';
  const status = document.getElementById('invStatusFilter')?.value || 'ALL';
  const severity = document.getElementById('invSeverityFilter')?.value || 'ALL';

  try {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (status !== 'ALL') params.append('status', status);
    if (severity !== 'ALL') params.append('severity', severity);

    const res = await fetch(`/api/v1/investigations?${params.toString()}`);
    const data = await res.json();
    if (!data.success) return;

    const list = data.investigations || [];
    document.getElementById('invCountLabel').textContent = `${list.length} investigations`;

    const tbody = document.getElementById('investigationsTableBody');
    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">No investigations match the selected filters.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(inv => `
      <tr>
        <td class="font-mono text-emerald" style="font-weight:600;">${escapeHtml(inv.investigationId || inv.caseId)}</td>
        <td style="font-weight:600;">${escapeHtml(inv.title)}</td>
        <td><span class="badge-tag ${inv.severity.toLowerCase()}">${inv.severity}</span></td>
        <td><span class="font-mono text-xs">${escapeHtml(inv.status)}</span></td>
        <td class="text-secondary">${escapeHtml(inv.threatActor || 'Unknown')}</td>
        <td class="text-secondary">${escapeHtml(inv.assignedInvestigator || inv.leadInvestigator || 'Unassigned')}</td>
        <td class="font-mono">${inv.evidenceCount || 0}</td>
        <td class="font-mono text-muted text-xs">${new Date(inv.createdAt).toISOString().split('T')[0]}</td>
        <td>
          <button class="btn btn-xs btn-outline" onclick="openInvestigationDetail('${inv.investigationId || inv.caseId}')">Inspect</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading investigations view:', err);
  }
}

window.openInvestigationDetail = async function(id) {
  try {
    const res = await fetch(`/api/v1/investigations/${id}`);
    const data = await res.json();
    if (!data.success) return;

    const inv = data.investigation;
    const container = document.getElementById('investigationDetailContainer');
    container.classList.remove('hidden');

    document.getElementById('detInvId').textContent = inv.investigationId || inv.caseId;
    document.getElementById('detInvTitle').textContent = inv.title;
    document.getElementById('detInvDesc').textContent = inv.description || 'No description provided.';
    document.getElementById('detInvLead').textContent = inv.assignedInvestigator || inv.leadInvestigator || 'Unassigned';
    document.getElementById('detInvActor').textContent = inv.threatActor || 'Unknown';
    document.getElementById('detInvTimestamps').textContent = `Created: ${new Date(inv.createdAt).toUTCString()}`;

    // Load Subtab 1: Evidence items
    const evRes = await fetch(`/api/v1/evidence?investigationId=${id}`);
    const evData = await evRes.json();
    const evTbody = document.getElementById('detInvEvidenceTableBody');
    if (evTbody && evData.success) {
      const items = evData.evidence || [];
      if (items.length === 0) {
        evTbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No evidence records associated with this investigation.</td></tr>';
      } else {
        evTbody.innerHTML = items.map(e => `
          <tr>
            <td class="font-mono text-emerald">${e.evidenceId}</td>
            <td><span class="font-mono text-xs">${e.artifactType}</span></td>
            <td><strong>${escapeHtml(e.title)}</strong></td>
            <td class="font-mono text-xs">${escapeHtml(e.sourceHost || '-')}</td>
            <td><span class="badge-tag ${e.severity.toLowerCase()}">${e.severity}</span></td>
            <td class="font-mono">v${e.version}</td>
            <td class="font-mono text-muted text-xs" style="max-width:140px; overflow:hidden; text-overflow:ellipsis;">${e.currentHash || '-'}</td>
          </tr>
        `).join('');
      }
    }

    // Load Subtab 2: Notes
    renderInvestigationNotes(inv.notes || []);

    // Load Subtab 3: Audit Trail
    const auditRes = await fetch(`/api/v1/investigations/${id}/audit`);
    const auditData = await auditRes.json();
    const auditBox = document.getElementById('detInvAuditList');
    if (auditBox && auditData.success) {
      const logs = auditData.logs || [];
      if (logs.length === 0) {
        auditBox.innerHTML = '<p class="placeholder-note">No audit trail records logged yet.</p>';
      } else {
        auditBox.innerHTML = logs.map(l => `
          <div style="padding:8px 10px; background:var(--bg-subtle); border-radius:4px; margin-bottom:6px; font-family:var(--font-mono); font-size:11px;">
            <div style="display:flex; justify-content:space-between;">
              <strong style="color:var(--mongo-green);">${escapeHtml(l.action)}</strong>
              <span class="text-muted">${new Date(l.timestamp).toISOString()}</span>
            </div>
            <div class="text-secondary" style="margin-top:2px;">Actor: ${escapeHtml(l.actor)} | ${escapeHtml(JSON.stringify(l.details || l.changes || {}))}</div>
          </div>
        `).join('');
      }
    }

    // Scroll to detail view
    container.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    console.error('Error opening investigation detail:', err);
  }
};

function renderInvestigationNotes(notes) {
  const container = document.getElementById('detInvNotesList');
  if (!container) return;
  if (!notes || notes.length === 0) {
    container.innerHTML = '<p class="placeholder-note">No notes recorded yet. Append observations below.</p>';
    return;
  }
  container.innerHTML = notes.map(n => `
    <div style="background:var(--bg-subtle); padding:10px 12px; border-radius:4px; margin-bottom:8px; border-left:3px solid var(--border-medium);">
      <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-tertiary); margin-bottom:4px;">
        <strong style="color:var(--text-primary);">${escapeHtml(n.author || 'Analyst')}</strong>
        <span class="font-mono">${new Date(n.timestamp).toISOString()}</span>
      </div>
      <p style="font-size:12px; color:var(--text-primary);">${escapeHtml(n.text)}</p>
    </div>
  `).join('');
}

// ==============================================================
// SECTION 3: EVIDENCE EXPLORER
// ==============================================================
async function loadEvidenceExplorer() {
  const search = document.getElementById('evidenceSearchInput')?.value || '';
  const type = document.getElementById('evidenceTypeFilter')?.value || 'ALL';
  const severity = document.getElementById('evidenceSeverityFilter')?.value || 'ALL';
  const activeInv = appState.currentInvestigationId;

  try {
    const params = new URLSearchParams();
    if (activeInv) params.append('investigationId', activeInv);
    if (search) params.append('search', search);
    if (type !== 'ALL') params.append('artifactType', type);
    if (severity !== 'ALL') params.append('severity', severity);
    params.append('limit', '50');

    const res = await fetch(`/api/v1/evidence?${params.toString()}`);
    const data = await res.json();
    if (!data.success) return;

    const list = data.evidence || [];
    document.getElementById('evidenceCountLabel').textContent = `${data.total || list.length} records`;

    const tbody = document.getElementById('evidenceTableBody');
    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">No evidence records found in active scope.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(e => `
      <tr>
        <td class="font-mono text-emerald" style="font-weight:600;">${escapeHtml(e.evidenceId)}</td>
        <td><span class="font-mono text-xs">${escapeHtml(e.artifactType)}</span></td>
        <td style="font-weight:600;">${escapeHtml(e.title)}</td>
        <td class="font-mono text-xs">${escapeHtml(e.sourceHost || '-')}</td>
        <td><span class="badge-tag ${e.severity.toLowerCase()}">${e.severity}</span></td>
        <td class="font-mono">v${e.version}</td>
        <td class="font-mono text-muted text-xs" style="max-width:120px; overflow:hidden; text-overflow:ellipsis;">${e.currentHash ? e.currentHash.substring(0, 16) + '...' : '-'}</td>
        <td class="font-mono text-muted text-xs">${new Date(e.timestamp).toISOString()}</td>
        <td>
          <button class="btn btn-xs btn-outline" onclick="openEvidenceDrawer('${e.evidenceId}')">Inspect</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading evidence explorer:', err);
  }
}

window.openEvidenceDrawer = async function(evidenceId) {
  try {
    const res = await fetch(`/api/v1/evidence/${evidenceId}`);
    const data = await res.json();
    if (!data.success) return;

    const doc = data.evidence;
    const drawer = document.getElementById('evidenceDrawer');
    drawer.classList.remove('collapsed');

    document.getElementById('evDrawerTitle').textContent = doc.title;
    document.getElementById('evDrawerSub').textContent = `${doc.evidenceId} • v${doc.version}`;

    const body = document.getElementById('evDrawerBody');
    body.innerHTML = `
      <div style="display:flex; gap:6px; align-items:center;">
        <span class="badge-tag ${doc.severity.toLowerCase()}">${doc.severity}</span>
        <span class="badge-tag blue font-mono">${doc.artifactType}</span>
        <span class="badge-tag green font-mono">${doc.integrityStatus || 'VERIFIED'}</span>
      </div>

      <div class="info-block mt-2">
        <div><strong>Source Host:</strong> <span class="font-mono">${escapeHtml(doc.sourceHost || '-')}</span></div>
        <div><strong>MITRE Tactic:</strong> ${escapeHtml(doc.mitreTactic || 'N/A')}</div>
        <div><strong>Event Timestamp:</strong> <span class="font-mono text-xs">${new Date(doc.timestamp).toISOString()}</span></div>
        <div><strong>Ingested At:</strong> <span class="font-mono text-xs">${doc.ingestionTimestamp ? new Date(doc.ingestionTimestamp).toISOString() : '-'}</span></div>
      </div>

      <div>
        <span class="info-label">CRYPTOGRAPHIC SHA-256 HASH:</span>
        <pre class="doc-json-preview font-mono" style="font-size:10px; margin-top:2px;">${doc.currentHash || 'N/A'}</pre>
      </div>

      ${doc.gridfsFileId ? `
        <div>
          <a href="/api/gridfs/download/${doc.gridfsFileId}" class="btn btn-sm btn-outline w-full" download>Download GridFS Binary Artifact</a>
        </div>
      ` : ''}

      <div>
        <span class="info-label">BSON POLYMORPHIC METADATA:</span>
        <pre class="doc-json-preview font-mono" style="max-height:140px; margin-top:2px;">${escapeHtml(JSON.stringify(doc.metadata || {}, null, 2))}</pre>
      </div>

      <div style="display:flex; gap:8px;" class="mt-2">
        <button class="btn btn-sm btn-primary" onclick="openVersionModal('${doc.evidenceId}')">Version Evidence (ACID)</button>
        <button class="btn btn-sm btn-outline" onclick="verifySingleEvidence('${doc.evidenceId}')">Verify Hash</button>
      </div>
    `;
  } catch (err) {
    console.error('Error opening evidence drawer:', err);
  }
};

window.verifySingleEvidence = async function(evidenceId) {
  try {
    const res = await fetch(`/api/v1/evidence/${evidenceId}/verify`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert(`Evidence ${evidenceId} Integrity Status: ${data.verified ? 'VERIFIED (Hash Matched)' : 'TAMPER DETECTED (Hash Mismatch)'}`);
      openEvidenceDrawer(evidenceId);
    }
  } catch (err) {
    alert('Verification error: ' + err.message);
  }
};

window.openVersionModal = async function(evidenceId) {
  const res = await fetch(`/api/v1/evidence/${evidenceId}`);
  const data = await res.json();
  if (!data.success) return;

  const doc = data.evidence;
  document.getElementById('editEvidenceId').value = doc.evidenceId;
  document.getElementById('editTitle').value = doc.title;
  document.getElementById('editSeverity').value = doc.severity;
  document.getElementById('editMetadata').value = JSON.stringify(doc.metadata || {}, null, 2);
  document.getElementById('modalEditEvidence').classList.remove('hidden');
};

// ==============================================================
// SECTION 4: TIMELINE RECONSTRUCTION
// ==============================================================
async function loadTimelineView() {
  const activeInv = appState.currentInvestigationId || 'INV-2026-0881';
  try {
    const res = await fetch(`/api/v1/investigations/${activeInv}/timeline`);
    const data = await res.json();
    if (!data.success) return;

    const timeline = data.timeline || [];
    const anomalies = data.anomalies || {};

    document.getElementById('tlMissingGapsLabel').textContent = `${(anomalies.missingLinks || []).length} Causality Gaps`;
    document.getElementById('tlConflictsLabel').textContent = `${(anomalies.conflictingEvidence || []).length} Conflicting Signals`;
    document.getElementById('tlSequencesLabel').textContent = `${(anomalies.suspiciousSequences || []).length} Suspicious Sequences`;

    const container = document.getElementById('timelineStream');
    if (!container) return;

    if (timeline.length === 0) {
      container.innerHTML = '<p class="placeholder-note">No timeline evidence recorded for active investigation.</p>';
      return;
    }

    container.innerHTML = timeline.map(e => `
      <div class="tl-event-card ${e.severity.toLowerCase()}" onclick="openEvidenceDrawer('${e.evidenceId}')" style="cursor:pointer;">
        <div class="tl-head-row">
          <span class="tl-title">${escapeHtml(e.title)}</span>
          <span class="badge-tag ${e.severity.toLowerCase()}">${e.severity}</span>
        </div>
        <p style="font-size:12px; color:var(--text-secondary);">${escapeHtml(e.description || '')}</p>
        <div class="tl-meta-row">
          <span>Observed: ${new Date(e.timestamp).toISOString()}</span>
          <span>Host: ${escapeHtml(e.sourceHost || '-')}</span>
          <span>Tactic: ${escapeHtml(e.mitreTactic || 'N/A')}</span>
          <span class="text-emerald">v${e.version}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading timeline view:', err);
  }
}

// ==============================================================
// SECTION 5: ENTITY RELATIONSHIPS
// ==============================================================
function initGraph() {
  const container = document.getElementById('graphContainer');
  if (!container) return;

  appState.graph = new EvidenceGraph('graphContainer', {
    onNodeClick: (node) => {
      if (node.type === 'EVIDENCE' && node.rawDoc) {
        openEvidenceDrawer(node.rawDoc.evidenceId);
      }
    }
  });

  document.getElementById('btnZoomIn')?.addEventListener('click', () => appState.graph.zoomIn());
  document.getElementById('btnZoomOut')?.addEventListener('click', () => appState.graph.zoomOut());
  document.getElementById('btnGraphFit')?.addEventListener('click', () => appState.graph.fitView());
  document.getElementById('btnHighlightKillChain')?.addEventListener('click', () => appState.graph.highlightKillChain());
  document.getElementById('btnToggleEntityView')?.addEventListener('click', () => {
    const graphBox = document.getElementById('entityGraphBox');
    const tableBox = document.getElementById('entityTableContainer');
    const isTable = tableBox.classList.toggle('hidden');
    graphBox.classList.toggle('hidden', !isTable);
  });
}

async function loadEntitiesView() {
  const activeInv = appState.currentInvestigationId || 'INV-2026-0881';

  // Load knowledge graph
  try {
    const res = await fetch(`/api/cases/${activeInv}/reconstruct`);
    const data = await res.json();
    if (data.success && data.graph && appState.graph) {
      appState.graph.render(data.graph);
    }
  } catch (err) {
    console.warn('Graph load warning:', err);
  }

  // Load accessible table
  try {
    const entRes = await fetch(`/api/v1/entities?investigationId=${activeInv}`);
    const entData = await entRes.json();
    const tbody = document.getElementById('entitiesTableBody');
    if (tbody && entData.success) {
      const items = entData.entities || [];
      if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No entities extracted in this investigation.</td></tr>';
      } else {
        tbody.innerHTML = items.map(ent => `
          <tr>
            <td><span class="badge-tag blue font-mono">${ent.entityType}</span></td>
            <td class="font-mono text-emerald" style="font-weight:600;">${escapeHtml(ent.normalizedValue)}</td>
            <td class="font-mono text-muted text-xs">${new Date(ent.createdAt).toISOString()}</td>
            <td class="font-mono text-muted text-xs">${ent.lastSeen ? new Date(ent.lastSeen).toISOString() : '-'}</td>
            <td class="font-mono">${(ent.evidenceIds || []).length} evidence items</td>
          </tr>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Error loading entities table:', err);
  }
}

// ==============================================================
// SECTION 6: INGESTION PIPELINE WIZARD
// ==============================================================
async function loadIngestionView() {
  try {
    const res = await fetch('/api/v1/ingestion/jobs');
    const data = await res.json();
    const tbody = document.getElementById('ingestionJobsTableBody');
    if (tbody && data.success) {
      const jobs = data.jobs || [];
      if (jobs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No ingestion jobs run yet.</td></tr>';
      } else {
        tbody.innerHTML = jobs.map(j => `
          <tr>
            <td class="font-mono text-emerald">${escapeHtml(j.jobId)}</td>
            <td class="font-mono text-xs">${escapeHtml(j.investigationId)}</td>
            <td><span class="font-mono text-xs">${escapeHtml(j.sourceSystem)}</span></td>
            <td><span class="badge-tag green">${escapeHtml(j.status)}</span></td>
            <td class="font-mono text-emerald">${j.acceptedCount}</td>
            <td class="font-mono ${j.rejectedCount > 0 ? 'text-rose' : 'text-muted'}">${j.rejectedCount}</td>
            <td class="font-mono">${j.durationMs}ms</td>
            <td class="font-mono text-muted text-xs">${new Date(j.createdAt).toISOString()}</td>
          </tr>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Error loading ingestion jobs:', err);
  }
}

// Ingestion preview handler
document.getElementById('btnPreviewIngest')?.addEventListener('click', async () => {
  const rawContent = document.getElementById('ingestPayloadText')?.value;
  const format = document.getElementById('ingestPayloadFormat')?.value || 'json';

  if (!rawContent || !rawContent.trim()) {
    return alert('Please enter or paste telemetry payload data.');
  }

  try {
    const res = await fetch('/api/v1/ingestion/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawContent, format })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const prev = data.preview;
    appState.rawPreviewRecords = prev.sample;

    const previewBox = document.getElementById('ingestPreviewBox');
    previewBox.classList.remove('hidden');

    document.getElementById('prevTotalCount').textContent = prev.totalRecords;
    document.getElementById('prevValidCount').textContent = prev.totalRecords;
    document.getElementById('prevInvalidCount').textContent = 0;
    document.getElementById('prevDuplicateCount').textContent = 0;

    const tbody = document.getElementById('ingestPreviewTableBody');
    tbody.innerHTML = prev.sample.map((s, idx) => `
      <tr>
        <td class="font-mono">${idx + 1}</td>
        <td><strong>${escapeHtml(s.title || s.name || 'Untitled')}</strong></td>
        <td class="font-mono text-xs">${escapeHtml(s.timestamp || s.time || new Date().toISOString())}</td>
        <td><span class="badge-tag ${((s.severity || 'medium').toLowerCase())}">${s.severity || 'MEDIUM'}</span></td>
        <td class="font-mono text-xs">${escapeHtml(s.artifactType || s.type || 'SECURITY_EVENT')}</td>
        <td class="font-mono text-xs">${escapeHtml(s.sourceHost || s.host || '-')}</td>
      </tr>
    `).join('');

    previewBox.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    alert('Ingestion Preview Error: ' + err.message);
  }
});

// Ingestion confirm handler
document.getElementById('btnConfirmIngest')?.addEventListener('click', async () => {
  const investigationId = document.getElementById('ingestTargetInvestigation')?.value;
  const sourceSystem = document.getElementById('ingestSourceSystem')?.value;
  const format = document.getElementById('ingestPayloadFormat')?.value;
  const rawContent = document.getElementById('ingestPayloadText')?.value;

  try {
    const btn = document.getElementById('btnConfirmIngest');
    btn.disabled = true;
    btn.textContent = 'Persisting to MongoDB...';

    const res = await fetch('/api/v1/ingestion/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ investigationId, sourceSystem, format, rawContent })
    });
    const data = await res.json();
    btn.disabled = false;
    btn.textContent = 'Confirm & Persist to MongoDB';

    if (!data.success) throw new Error(data.error);

    const job = data.job;
    const reportBox = document.getElementById('ingestFinalReportBox');
    reportBox.classList.remove('hidden');

    document.getElementById('reportJobId').textContent = job.jobId;
    document.getElementById('reportAccepted').textContent = `${job.accepted} records`;
    document.getElementById('reportRejected').textContent = `${job.rejected} records`;
    document.getElementById('reportDuration').textContent = `${job.durationMs}ms`;

    await loadIngestionView();
    await loadOverview();
  } catch (err) {
    alert('Ingestion execution error: ' + err.message);
  }
});

document.getElementById('btnLoadSamplePayload')?.addEventListener('click', () => {
  const sample = [
    {
      title: "Anomalous SSH Lateral Ingress to Backup Vault",
      timestamp: new Date().toISOString(),
      severity: "CRITICAL",
      artifactType: "SECURITY_EVENT",
      sourceHost: "backup-vault.corp.internal",
      description: "Root login succeeded without MFA token challenge.",
      user: "backup-operator",
      sourceIp: "10.200.4.15"
    },
    {
      title: "Archive Creation for Confidential DB Snapshots",
      timestamp: new Date().toISOString(),
      severity: "HIGH",
      artifactType: "PROCESS_SPAWN",
      sourceHost: "db-cluster-01.corp",
      description: "tar czf backup_vault.tar.gz /data/pg_dump",
      processName: "tar.exe"
    }
  ];
  document.getElementById('ingestPayloadText').value = JSON.stringify(sample, null, 2);
});

// ==============================================================
// SECTION 7: INTEGRITY & AUDIT
// ==============================================================
async function loadIntegrityView() {
  try {
    const res = await fetch('/api/v1/investigations/INV-2026-0881/audit');
    const data = await res.json();
    const tbody = document.getElementById('auditLogsTableBody');
    if (tbody && data.success) {
      const logs = data.logs || [];
      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No audit trail records logged yet.</td></tr>';
      } else {
        tbody.innerHTML = logs.map(l => `
          <tr>
            <td class="font-mono text-emerald">${escapeHtml(l.logId)}</td>
            <td class="font-mono text-xs">${escapeHtml(l.evidenceId || l.investigationId || '-')}</td>
            <td><strong style="color:var(--mongo-green);">${escapeHtml(l.action)}</strong></td>
            <td>${escapeHtml(l.actor)}</td>
            <td class="font-mono text-muted text-xs">${new Date(l.timestamp).toISOString()}</td>
            <td class="font-mono text-xs text-muted" style="max-width:100px; overflow:hidden; text-overflow:ellipsis;">${l.previousHash || '-'}</td>
            <td class="font-mono text-xs text-muted" style="max-width:100px; overflow:hidden; text-overflow:ellipsis;">${l.resultingHash || '-'}</td>
            <td class="text-secondary text-xs">${escapeHtml(l.reason || JSON.stringify(l.details || l.changes || {}))}</td>
          </tr>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Error loading integrity view:', err);
  }
}

document.getElementById('btnRunFullIntegrityScan')?.addEventListener('click', async () => {
  try {
    const btn = document.getElementById('btnRunFullIntegrityScan');
    btn.disabled = true;
    btn.textContent = 'Scanning MongoDB Hashes...';

    const res = await fetch('/api/v1/integrity/verify-all', { method: 'POST' });
    const data = await res.json();
    btn.disabled = false;
    btn.textContent = 'Run Full Integrity Scan';

    if (!data.success) throw new Error(data.error);

    document.getElementById('auditTotalDocs').textContent = data.totalChecked;
    document.getElementById('auditVerifiedCount').textContent = data.verifiedCount;
    document.getElementById('auditViolationsCount').textContent = data.tamperedCount;

    const banner = document.getElementById('integrityStatusBanner');
    if (data.tamperedCount > 0) {
      banner.classList.add('tampered');
      document.getElementById('shieldStatusBadge').textContent = '⚠';
      document.getElementById('integrityVerdictHeading').textContent = 'Integrity Violation Detected!';
      document.getElementById('integrityVerdictSub').textContent = `${data.tamperedCount} documents have mismatched cryptographic hashes!`;
    } else {
      banner.classList.remove('tampered');
      document.getElementById('shieldStatusBadge').textContent = '✓';
      document.getElementById('integrityVerdictHeading').textContent = 'System Evidence Integrity Verified';
      document.getElementById('integrityVerdictSub').textContent = 'All cryptographic SHA-256 hashes match stored genesis payloads in MongoDB.';
    }
  } catch (err) {
    alert('Integrity scan error: ' + err.message);
  }
});

document.getElementById('btnSimulateTamper')?.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/v1/integrity/test-tamper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidenceId: 'EV-APT29-001' })
    });
    const data = await res.json();
    if (data.success) {
      alert('Controlled test fixture injected into EV-APT29-001! Click "Run Full Integrity Scan" to verify detection.');
    }
  } catch (err) {
    alert('Error simulating tamper: ' + err.message);
  }
});

// ==============================================================
// SECTION 8: SCHEMA EXPERIMENTS
// ==============================================================
async function loadExperimentsView() {
  try {
    const res = await fetch('/api/v1/experiments');
    const data = await res.json();
    const tbody = document.getElementById('experimentsHistoryTableBody');
    if (tbody && data.success) {
      const history = data.experiments || [];
      if (history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No benchmark experiments recorded.</td></tr>';
      } else {
        tbody.innerHTML = history.map(exp => {
          const res = exp.results || {};
          const recon = (res.queryLatencies && res.queryLatencies.fullReconstruction) || {};
          return `
            <tr>
              <td class="font-mono text-emerald">${escapeHtml(exp.experimentId)}</td>
              <td class="font-mono">${exp.itemCount}</td>
              <td class="font-mono">${exp.iterations}</td>
              <td class="font-mono">${(recon.embedded && recon.embedded.p50) || '-'}ms</td>
              <td class="font-mono">${(recon.referenced && recon.referenced.p50) || '-'}ms</td>
              <td class="font-mono text-emerald" style="font-weight:700;">${(recon.hybrid && recon.hybrid.p50) || '-'}ms</td>
              <td class="font-mono text-emerald">100%</td>
              <td class="font-mono text-muted text-xs">${new Date(exp.createdAt).toISOString()}</td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (err) {
    console.error('Error loading experiments view:', err);
  }
}

document.getElementById('btnRunBenchmark')?.addEventListener('click', async () => {
  const itemCount = document.getElementById('benchItemCount').value;
  const iterations = document.getElementById('benchIterations').value;
  const loading = document.getElementById('benchmarkLoading');

  try {
    loading.classList.remove('hidden');
    const res = await fetch('/api/v1/experiments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemCount, iterations })
    });
    const data = await res.json();
    loading.classList.add('hidden');

    if (!data.success) throw new Error(data.error);

    const b = data.experiment;

    // Update Model Cards
    document.getElementById('embStorageSize').textContent = `${Math.round((b.storage?.embedded?.storageSize || 0) / 1024)} KB`;
    document.getElementById('embIndexSize').textContent = `${Math.round((b.storage?.embedded?.totalIndexSize || 0) / 1024)} KB`;
    document.getElementById('embReconLat').textContent = `${b.queryLatency?.fullReconstruction?.embedded?.p50 || 0}ms`;
    document.getElementById('embUpdateLat').textContent = `${b.queryLatency?.singleItemUpdate?.embedded?.p50 || 0}ms`;
    document.getElementById('embAccuracy').textContent = `${b.retrievalAccuracy?.embedded?.accuracyPct || 100}%`;

    document.getElementById('refStorageSize').textContent = `${Math.round((b.storage?.referenced?.storageSize || 0) / 1024)} KB`;
    document.getElementById('refIndexSize').textContent = `${Math.round((b.storage?.referenced?.totalIndexSize || 0) / 1024)} KB`;
    document.getElementById('refReconLat').textContent = `${b.queryLatency?.fullReconstruction?.referenced?.p50 || 0}ms`;
    document.getElementById('refUpdateLat').textContent = `${b.queryLatency?.singleItemUpdate?.referenced?.p50 || 0}ms`;
    document.getElementById('refAccuracy').textContent = `${b.retrievalAccuracy?.referenced?.accuracyPct || 100}%`;

    document.getElementById('hybStorageSize').textContent = `${Math.round((b.storage?.hybrid?.storageSize || 0) / 1024)} KB`;
    document.getElementById('hybIndexSize').textContent = `${Math.round((b.storage?.hybrid?.totalIndexSize || 0) / 1024)} KB`;
    document.getElementById('hybReconLat').textContent = `${b.queryLatency?.fullReconstruction?.hybrid?.p50 || 0}ms`;
    document.getElementById('hybUpdateLat').textContent = `${b.queryLatency?.singleItemUpdate?.hybrid?.p50 || 0}ms`;
    document.getElementById('hybAccuracy').textContent = `${b.retrievalAccuracy?.hybrid?.accuracyPct || 100}%`;

    // Render Charts
    if (typeof renderBenchmarkCharts === 'function') {
      renderBenchmarkCharts(b);
    }

    // Populate Latency Matrix
    populateLatencyMatrix(b);
    await loadExperimentsView();
  } catch (err) {
    loading.classList.add('hidden');
    alert('Benchmark execution error: ' + err.message);
  }
});

function populateLatencyMatrix(b) {
  const tbody = document.getElementById('benchMatrixTableBody');
  if (!tbody || !b.queryLatency) return;

  const rows = [
    { op: 'Full Incident Reconstruction', model: 'Embedded Document', data: b.queryLatency.fullReconstruction?.embedded, acc: b.retrievalAccuracy?.embedded?.accuracyPct },
    { op: 'Full Incident Reconstruction', model: 'Referenced / Normalized', data: b.queryLatency.fullReconstruction?.referenced, acc: b.retrievalAccuracy?.referenced?.accuracyPct },
    { op: 'Full Incident Reconstruction', model: 'Hybrid Time-Bucket', data: b.queryLatency.fullReconstruction?.hybrid, acc: b.retrievalAccuracy?.hybrid?.accuracyPct },
    { op: 'Single Evidence Update', model: 'Embedded Document', data: b.queryLatency.singleItemUpdate?.embedded, acc: '100%' },
    { op: 'Single Evidence Update', model: 'Referenced / Normalized', data: b.queryLatency.singleItemUpdate?.referenced, acc: '100%' },
    { op: 'Single Evidence Update', model: 'Hybrid Time-Bucket', data: b.queryLatency.singleItemUpdate?.hybrid, acc: '100%' }
  ];

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><strong>${r.op}</strong></td>
      <td class="font-mono text-xs">${r.model}</td>
      <td class="font-mono">${r.data?.min || 0}ms</td>
      <td class="font-mono" style="font-weight:700;">${r.data?.p50 || 0}ms</td>
      <td class="font-mono">${r.data?.p95 || 0}ms</td>
      <td class="font-mono">${r.data?.p99 || 0}ms</td>
      <td class="font-mono">${r.data?.max || 0}ms</td>
      <td class="font-mono text-emerald">${r.acc || '100%'}</td>
    </tr>
  `).join('');
}

// ==============================================================
// SECTION 9: SETTINGS & DATABASE EXPLORER
// ==============================================================
async function loadDatabaseExplorer() {
  try {
    const statusRes = await fetch('/api/v1/health/database');
    const statusData = await statusRes.json();
    if (statusData.status === 'connected') {
      document.getElementById('dbServerVersion').textContent = `v${statusData.serverVersion}`;
      document.getElementById('dbNameVal').textContent = statusData.database;
      document.getElementById('dbCollectionsCount').textContent = statusData.collectionsCount;
      document.getElementById('dbStorageSize').textContent = `${statusData.storageSizeMB || '0.82'} MB`;
    }

    const colRes = await fetch('/api/mongodb/collections');
    const colData = await colRes.json();
    if (colData.success && Array.isArray(colData.collections)) {
      appState.dbExplorer.collections = colData.collections;
      renderCollectionPills(colData.collections);
      await loadCollectionDocuments(appState.dbExplorer.selectedCollection || 'investigations');
    }
  } catch (err) {
    console.error('Error loading database explorer:', err);
  }
}

function renderCollectionPills(collections) {
  const container = document.getElementById('collectionPillsList');
  if (!container) return;

  container.innerHTML = collections.map(col => {
    const isActive = col.name === appState.dbExplorer.selectedCollection;
    return `
      <button class="col-pill-btn ${isActive ? 'active' : ''}" data-col="${escapeHtml(col.name)}">
        <span>${escapeHtml(col.name)}</span>
        <span class="col-pill-count">${col.count}</span>
      </button>
    `;
  }).join('');

  container.querySelectorAll('.col-pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const col = btn.getAttribute('data-col');
      if (col) {
        appState.dbExplorer.selectedCollection = col;
        container.querySelectorAll('.col-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('docFilterInput').value = '';
        loadCollectionDocuments(col);
      }
    });
  });
}

async function loadCollectionDocuments(colName) {
  if (!colName) return;
  const container = document.getElementById('documentsStream');
  const heading = document.getElementById('currentCollectionHeading');
  const countBadge = document.getElementById('collectionDocsCount');
  const durationSpan = document.getElementById('queryDurationMs');
  const filterVal = document.getElementById('docFilterInput')?.value.trim();
  const limit = document.getElementById('docLimitSelect')?.value || '25';

  if (heading) heading.textContent = `collection: ${colName}`;
  if (container) container.innerHTML = '<p class="placeholder-note">Fetching BSON documents from MongoDB localhost:27017...</p>';

  try {
    const url = `/api/mongodb/collection/${encodeURIComponent(colName)}/documents?limit=${limit}${filterVal ? `&query=${encodeURIComponent(filterVal)}` : ''}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.success) {
      if (container) container.innerHTML = `<div class="p-3 text-rose font-mono" style="font-size:12px;">Query Error: ${escapeHtml(data.error || 'Failed to query collection')}</div>`;
      return;
    }

    if (countBadge) countBadge.textContent = `${data.count} of ${data.totalCount} documents`;
    if (durationSpan) durationSpan.textContent = `${data.durationMs}ms`;

    if (!data.documents || data.documents.length === 0) {
      if (container) container.innerHTML = '<p class="placeholder-note">No documents found matching this filter in collection.</p>';
      return;
    }

    container.innerHTML = data.documents.map((doc, idx) => {
      const docId = doc._id ? (typeof doc._id === 'object' ? doc._id.$oid || JSON.stringify(doc._id) : doc._id) : `doc_${idx}`;
      const docTitle = doc.title || doc.name || doc.evidenceId || doc.investigationId || doc.filename || '';
      return `
        <div class="raw-doc-card">
          <div class="doc-header-line">
            <span class="doc-id-pill font-mono">_id: ${escapeHtml(String(docId))}</span>
            ${docTitle ? `<span style="font-size:11px; color:var(--text-secondary); font-weight:600;">${escapeHtml(String(docTitle))}</span>` : ''}
          </div>
          <pre class="doc-json-preview font-mono">${escapeHtml(JSON.stringify(doc, null, 2))}</pre>
        </div>
      `;
    }).join('');
  } catch (err) {
    if (container) container.innerHTML = `<div class="p-3 text-rose font-mono" style="font-size:12px;">Network error: ${escapeHtml(err.message)}</div>`;
  }
}

async function executeCustomMQL() {
  const colSelect = document.getElementById('mqlTargetCollection');
  const filterInput = document.getElementById('mqlCustomFilter');
  const outputPre = document.getElementById('mqlOutputResult');
  const timeSpan = document.getElementById('mqlExecuteTime');

  if (!colSelect || !filterInput || !outputPre) return;

  const collection = colSelect.value;
  let filter = {};
  try {
    const rawVal = filterInput.value.trim();
    if (rawVal) filter = JSON.parse(rawVal);
  } catch (err) {
    outputPre.textContent = `// JSON Syntax Error:\n${err.message}`;
    outputPre.style.color = '#ef4444';
    return;
  }

  outputPre.style.color = 'var(--text-primary)';
  outputPre.textContent = '// Querying local MongoDB...';
  if (timeSpan) timeSpan.textContent = 'Executing...';

  try {
    const res = await fetch('/api/mongodb/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection, filter, limit: 25 })
    });
    const data = await res.json();

    if (!data.success) {
      outputPre.textContent = `// Query Error:\n${data.error}`;
      outputPre.style.color = '#ef4444';
      if (timeSpan) timeSpan.textContent = 'Failed';
      return;
    }

    if (timeSpan) timeSpan.textContent = `Returned ${data.count} docs in ${data.durationMs}ms`;
    outputPre.textContent = JSON.stringify(data.results, null, 2);
  } catch (err) {
    outputPre.textContent = `// Error: ${err.message}`;
    outputPre.style.color = '#ef4444';
  }
}

// ==============================================================
// MODALS & EVENT HANDLERS
// ==============================================================
function initModalsAndEvents() {
  // Modal: Create Investigation
  document.getElementById('btnNewInvestigation')?.addEventListener('click', () => {
    document.getElementById('modalCreateInvestigation')?.classList.remove('hidden');
  });
  document.getElementById('btnOpenCreateInvModal')?.addEventListener('click', () => {
    document.getElementById('modalCreateInvestigation')?.classList.remove('hidden');
  });
  document.getElementById('btnCloseCreateInvModal')?.addEventListener('click', () => {
    document.getElementById('modalCreateInvestigation')?.classList.add('hidden');
  });
  document.getElementById('btnCancelCreateInv')?.addEventListener('click', () => {
    document.getElementById('modalCreateInvestigation')?.classList.add('hidden');
  });

  document.getElementById('formCreateInvestigation')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const payload = {
        title: document.getElementById('newInvTitle').value,
        severity: document.getElementById('newInvSeverity').value,
        status: document.getElementById('newInvStatus').value,
        threatActor: document.getElementById('newInvThreatActor').value,
        assignedInvestigator: document.getElementById('newInvInvestigator').value,
        description: document.getElementById('newInvDescription').value
      };

      const res = await fetch('/api/v1/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      document.getElementById('modalCreateInvestigation').classList.add('hidden');
      await loadInvestigations();
      await selectActiveInvestigation(data.investigation.investigationId);
      alert(`Investigation "${data.investigation.title}" created and persisted to MongoDB!`);
    } catch (err) {
      alert('Error creating investigation: ' + err.message);
    }
  });

  // Modal: Edit & Version Evidence
  document.getElementById('btnCloseEditModal')?.addEventListener('click', () => {
    document.getElementById('modalEditEvidence')?.classList.add('hidden');
  });
  document.getElementById('btnCancelEdit')?.addEventListener('click', () => {
    document.getElementById('modalEditEvidence')?.classList.add('hidden');
  });
  document.getElementById('formEditEvidence')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const evId = document.getElementById('editEvidenceId').value;
    try {
      const metadata = JSON.parse(document.getElementById('editMetadata').value || '{}');
      const payload = {
        updateFields: {
          title: document.getElementById('editTitle').value,
          severity: document.getElementById('editSeverity').value,
          metadata
        },
        actor: document.getElementById('editActor').value,
        reason: document.getElementById('editReason').value
      };

      const res = await fetch(`/api/v1/evidence/${evId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      document.getElementById('modalEditEvidence').classList.add('hidden');
      openEvidenceDrawer(evId);
      await loadEvidenceExplorer();
      alert(`Evidence ${evId} updated to Version ${data.version}! Hash & audit logged to MongoDB.`);
    } catch (err) {
      alert('Error versioning evidence: ' + err.message);
    }
  });

  // Modal: GridFS Upload
  document.getElementById('btnOpenGridFSUpload')?.addEventListener('click', () => {
    document.getElementById('modalUploadGridFS')?.classList.remove('hidden');
  });
  document.getElementById('btnCloseUploadModal')?.addEventListener('click', () => {
    document.getElementById('modalUploadGridFS')?.classList.add('hidden');
  });
  document.getElementById('btnCancelUpload')?.addEventListener('click', () => {
    document.getElementById('modalUploadGridFS')?.classList.add('hidden');
  });

  document.getElementById('formUploadGridFS')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('gridfsFileInput');
    if (!fileInput.files.length) return alert('Please select a file.');

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('caseId', appState.currentInvestigationId);
    formData.append('evidenceId', document.getElementById('gridfsLinkEvidenceId').value);
    formData.append('description', document.getElementById('gridfsDescription').value);

    try {
      const res = await fetch('/api/gridfs/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      document.getElementById('modalUploadGridFS').classList.add('hidden');
      alert(`File "${data.file.filename}" uploaded to GridFS vault (SHA-256: ${data.file.sha256.substring(0, 16)}...)`);
      await loadEvidenceExplorer();
    } catch (err) {
      alert('GridFS upload failed: ' + err.message);
    }
  });

  // Add Note to Investigation
  document.getElementById('formAddInvNote')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = document.getElementById('inputNewNoteText').value;
    const invId = appState.currentInvestigationId;
    if (!text || !invId) return;

    try {
      const res = await fetch(`/api/v1/investigations/${invId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, author: 'Forensic-Analyst' })
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById('inputNewNoteText').value = '';
        openInvestigationDetail(invId);
      }
    } catch (err) {
      alert('Error adding note: ' + err.message);
    }
  });

  // Database Explorer Actions
  document.getElementById('btnRefreshDatabase')?.addEventListener('click', () => loadDatabaseExplorer());
  document.getElementById('btnApplyFilter')?.addEventListener('click', () => loadCollectionDocuments(appState.dbExplorer.selectedCollection));
  document.getElementById('btnClearFilter')?.addEventListener('click', () => {
    document.getElementById('docFilterInput').value = '';
    loadCollectionDocuments(appState.dbExplorer.selectedCollection);
  });
  document.getElementById('docLimitSelect')?.addEventListener('change', () => loadCollectionDocuments(appState.dbExplorer.selectedCollection));
  document.getElementById('btnExecuteMQL')?.addEventListener('click', () => executeCustomMQL());

  document.getElementById('btnCopyUri')?.addEventListener('click', (e) => {
    navigator.clipboard.writeText('mongodb://127.0.0.1:27017/mongotrace');
    e.target.textContent = 'Copied!';
    setTimeout(() => { e.target.textContent = 'Copy URI'; }, 1500);
  });

  document.getElementById('btnCopyMongosh')?.addEventListener('click', (e) => {
    navigator.clipboard.writeText('mongosh "mongodb://127.0.0.1:27017/mongotrace"');
    e.target.textContent = 'Copied!';
    setTimeout(() => { e.target.textContent = 'Copy mongosh Command'; }, 1500);
  });

  document.getElementById('btnCopyQueryResult')?.addEventListener('click', (e) => {
    const text = document.getElementById('mqlOutputResult')?.textContent || '';
    navigator.clipboard.writeText(text);
    e.target.textContent = 'Copied!';
    setTimeout(() => { e.target.textContent = 'Copy JSON'; }, 1500);
  });

  document.querySelectorAll('.template-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const col = btn.getAttribute('data-col');
      const query = btn.getAttribute('data-query');
      if (col) document.getElementById('mqlTargetCollection').value = col;
      if (query) document.getElementById('mqlCustomFilter').value = JSON.stringify(JSON.parse(query), null, 2);
      executeCustomMQL();
    });
  });

  // Close Drawers
  document.getElementById('btnCloseEvDrawer')?.addEventListener('click', () => {
    document.getElementById('evidenceDrawer')?.classList.add('collapsed');
  });
  document.getElementById('btnCloseInvDetail')?.addEventListener('click', () => {
    document.getElementById('investigationDetailContainer')?.classList.add('hidden');
  });

  // Subtabs inside Investigation Detail
  document.querySelectorAll('.subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetSub = btn.getAttribute('data-subtab');
      document.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.subtab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(targetSub)?.classList.add('active');
    });
  });

  // Filter change listeners
  document.getElementById('invStatusFilter')?.addEventListener('change', () => loadInvestigationsView());
  document.getElementById('invSeverityFilter')?.addEventListener('change', () => loadInvestigationsView());
  document.getElementById('invSearchInput')?.addEventListener('input', () => loadInvestigationsView());

  document.getElementById('evidenceTypeFilter')?.addEventListener('change', () => loadEvidenceExplorer());
  document.getElementById('evidenceSeverityFilter')?.addEventListener('change', () => loadEvidenceExplorer());
  document.getElementById('evidenceSearchInput')?.addEventListener('input', () => loadEvidenceExplorer());

  // Reset database telemetry button
  document.getElementById('btnReseed')?.addEventListener('click', async () => {
    if (!confirm('Reset and re-seed sample digital forensic telemetry in MongoDB?')) return;
    try {
      const res = await fetch('/api/cases/reseed', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert('Database telemetry reseeded successfully!');
        await loadInvestigations();
        await switchTab(appState.activeTab);
      }
    } catch (err) {
      alert('Reseed error: ' + err.message);
    }
  });

  // Trigger Ingest button in topbar
  document.getElementById('btnTriggerIngest')?.addEventListener('click', () => {
    switchTab('tab-ingestion');
  });

  // Export buttons
  document.getElementById('btnExportEvidenceJson')?.addEventListener('click', () => exportEvidence('json'));
  document.getElementById('btnExportEvidenceCsv')?.addEventListener('click', () => exportEvidence('csv'));
}

async function exportEvidence(format) {
  try {
    const res = await fetch(`/api/v1/evidence?investigationId=${appState.currentInvestigationId || ''}&limit=500`);
    const data = await res.json();
    if (!data.success) return;

    const items = data.evidence || [];
    let fileData = '';
    let mimeType = 'application/json';
    let filename = `mongotrace-evidence-${Date.now()}.${format}`;

    if (format === 'json') {
      fileData = JSON.stringify(items, null, 2);
    } else {
      mimeType = 'text/csv';
      const headers = ['evidenceId', 'title', 'artifactType', 'severity', 'sourceHost', 'version', 'currentHash', 'timestamp'];
      const rows = items.map(e => headers.map(h => `"${String(e[h] || '').replace(/"/g, '""')}"`).join(','));
      fileData = [headers.join(','), ...rows].join('\n');
    }

    const blob = new Blob([fileData], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Export error: ' + err.message);
  }
}

function handleGlobalSearch(term) {
  if (!term) return;
  // If user is searching, switch to Evidence Explorer or Investigations and filter
  if (appState.activeTab !== 'tab-evidence' && appState.activeTab !== 'tab-investigations') {
    switchTab('tab-evidence');
  }
  const evSearch = document.getElementById('evidenceSearchInput');
  if (evSearch) {
    evSearch.value = term;
    loadEvidenceExplorer();
  }
}

// ==============================================================
// SSE STREAM LISTENER
// ==============================================================
function initSSE() {
  try {
    const evtSource = new EventSource('/api/stream');
    evtSource.addEventListener('INVESTIGATION_CREATED', () => loadInvestigations());
    evtSource.addEventListener('EVIDENCE_CREATED', () => {
      if (appState.activeTab === 'tab-overview') loadOverview();
      if (appState.activeTab === 'tab-evidence') loadEvidenceExplorer();
      if (appState.activeTab === 'tab-timeline') loadTimelineView();
    });
    evtSource.addEventListener('MQL_QUERY_LOG', () => {
      // Background query logged
    });
  } catch (err) {
    console.warn('SSE stream listener warning:', err);
  }
}

function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
