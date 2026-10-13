/**
 * MongoTrace Schema Benchmark Clean Chart Visualizations
 */
let chartStorageInstance = null;
let chartLatencyInstance = null;

function renderBenchmarkCharts(benchmarkData) {
  const { storage, queryLatency } = benchmarkData;

  // 1. Storage & Index Comparison Chart
  const ctxStorage = document.getElementById('chartStorage');
  if (ctxStorage) {
    if (chartStorageInstance) chartStorageInstance.destroy();

    const embStorageKB = Math.round((storage.embedded?.storageSize || 0) / 1024);
    const embIndexKB = Math.round((storage.embedded?.totalIndexSize || 0) / 1024);

    const refStorageKB = Math.round((storage.referenced?.storageSize || 0) / 1024);
    const refIndexKB = Math.round((storage.referenced?.totalIndexSize || 0) / 1024);

    const hybStorageKB = Math.round((storage.hybrid?.storageSize || 0) / 1024);
    const hybIndexKB = Math.round((storage.hybrid?.totalIndexSize || 0) / 1024);

    chartStorageInstance = new Chart(ctxStorage, {
      type: 'bar',
      data: {
        labels: ['Embedded Document', 'Referenced / Normalized', 'Hybrid Time-Bucket'],
        datasets: [
          {
            label: 'Data Storage (KB)',
            data: [embStorageKB, refStorageKB, hybStorageKB],
            backgroundColor: '#00684a',
            borderRadius: 4
          },
          {
            label: 'Index Size (KB)',
            data: [embIndexKB, refIndexKB, hybIndexKB],
            backgroundColor: '#3b82f6',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#334155', font: { family: 'Inter', size: 11, weight: '500' }, boxWidth: 12 }
          },
          tooltip: {
            backgroundColor: '#ffffff',
            borderColor: '#e2e8f0',
            borderWidth: 1,
            titleColor: '#0f172a',
            bodyColor: '#334155',
            titleFont: { family: 'Inter', size: 12, weight: '600' },
            bodyFont: { family: 'JetBrains Mono', size: 11 },
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
          }
        },
        scales: {
          x: {
            ticks: { color: '#475569', font: { family: 'Inter', size: 11, weight: '500' } },
            grid: { display: false }
          },
          y: {
            ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 } },
            grid: { color: '#f1f5f9' }
          }
        }
      }
    });
  }

  // 2. Query Latencies (p50 Median ms) Chart
  const ctxLatency = document.getElementById('chartLatency');
  if (ctxLatency) {
    if (chartLatencyInstance) chartLatencyInstance.destroy();

    const reconEmb = queryLatency.fullReconstruction?.embedded?.p50 || 0;
    const reconRef = queryLatency.fullReconstruction?.referenced?.p50 || 0;
    const reconHyb = queryLatency.fullReconstruction?.hybrid?.p50 || 0;

    const rangeEmb = queryLatency.timeWindowRange?.embedded?.p50 || 0;
    const rangeRef = queryLatency.timeWindowRange?.referenced?.p50 || 0;
    const rangeHyb = queryLatency.timeWindowRange?.hybrid?.p50 || 0;

    const updateEmb = queryLatency.singleItemUpdate?.embedded?.p50 || 0;
    const updateRef = queryLatency.singleItemUpdate?.referenced?.p50 || 0;
    const updateHyb = queryLatency.singleItemUpdate?.hybrid?.p50 || 0;

    chartLatencyInstance = new Chart(ctxLatency, {
      type: 'bar',
      data: {
        labels: ['Full Incident Reconstruction', 'Time-Window Filter', 'Single Item Version Update'],
        datasets: [
          {
            label: 'Embedded Document',
            data: [reconEmb, rangeEmb, updateEmb],
            backgroundColor: '#d97706',
            borderRadius: 4
          },
          {
            label: 'Referenced / Normalized',
            data: [reconRef, rangeRef, updateRef],
            backgroundColor: '#2563eb',
            borderRadius: 4
          },
          {
            label: 'Hybrid Time-Bucket',
            data: [reconHyb, rangeHyb, updateHyb],
            backgroundColor: '#059669',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#334155', font: { family: 'Inter', size: 11, weight: '500' }, boxWidth: 12 }
          },
          tooltip: {
            backgroundColor: '#ffffff',
            borderColor: '#e2e8f0',
            borderWidth: 1,
            titleColor: '#0f172a',
            bodyColor: '#334155',
            titleFont: { family: 'Inter', size: 12, weight: '600' },
            bodyFont: { family: 'JetBrains Mono', size: 11 }
          }
        },
        scales: {
          x: {
            ticks: { color: '#475569', font: { family: 'Inter', size: 11, weight: '500' } },
            grid: { display: false }
          },
          y: {
            title: { display: true, text: 'Milliseconds (ms)', color: '#64748b', font: { size: 10 } },
            ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 } },
            grid: { color: '#f1f5f9' }
          }
        }
      }
    });
  }
}

window.renderBenchmarkCharts = renderBenchmarkCharts;
