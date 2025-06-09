// script.js

//========= 1) Scenario Name Helper ==========
function getScenarioName(exp) {
  const count = (exp.match(/guest_/g) || []).length;
  if (count === 0) {
    return 'Host Only';
  }
  if (count === 3) {
    return 'Host + LTA + Housing + Grab';
  }
  const parts = [];
  if (exp.includes('guest_1')) parts.push('LTA');
  if (exp.includes('guest_2')) parts.push('Housing');
  if (exp.includes('guest_3')) parts.push('Grab');
  return 'Host + ' + parts.join(' + ');
}

//========= 2) Color & Name Mappings ==========
const comboColors = {
  'Host + LTA + Housing + Grab': '#1f77b4',
  'Host + LTA + Housing':        '#d62728',
  'Host + LTA + Grab':           '#2ca02c',
  'Host + Housing + Grab':       '#ff7f0e',
  'Host + LTA':                  '#9467bd',
  'Host + Housing':              '#8c564b',
  'Host + Grab':                 '#e377c2',
  'Host Only':                   '#7f7f7f'
};
const clientColors = {
  host:    '#000000',
  guest_1: '#d62728',  // LTA
  guest_2: '#2ca02c',  // Housing
  guest_3: '#ff7f0e'   // Grab
};
const clientNames = {
  host:    'HDB Carpark',
  guest_1: 'LTA',
  guest_2: 'HDB Housing',
  guest_3: 'Grab'
};
const descriptions = {
  trainingLoss:
    'Shows how well the model is fitting the training data; lower values indicate a better fit.',
  testMSE:
    'Shows prediction error on unseen data; lower values mean the model generalizes more accurately.',
  contrib:
    'Shows each client’s impact on the model’s performance; larger values indicate greater contribution.'
};

//======== 3) Data Storage Structures ========
const dataByRep = {};      // federated data organized by repetition → experiment string → array of rows
let independentData = [];  // holds data from independent_1500.csv

//======== 4) Load All Three CSVs via D3 =========
// We assume the folder “data/” sits next to index.html and contains exactly:
//   - 3clients_newgt_v1.csv
//   - 3clients_newgt_v2.csv
//   - independent_1500.csv
Promise.all([
  d3.csv('data/3clients_newgt_v1.csv', d3.autoType),
  d3.csv('data/3clients_newgt_v2.csv', d3.autoType),
  d3.csv('data/independent_1500.csv', d3.autoType)
])
  .then(([rowsV1, rowsV2, rowsInd]) => {
    // 4a) Offset repetition IDs in v2 so they immediately follow v1
    const maxRepV1 = d3.max(rowsV1, d => d.repetition);
    rowsV2.forEach(d => {
      d.repetition = d.repetition + maxRepV1;
    });
    // 4b) Combine federated rows
    const allRows = rowsV1.concat(rowsV2);
    allRows.forEach(d => {
      const rep = d.repetition;
      const exp = d.experiment;
      if (!dataByRep[rep]) dataByRep[rep] = {};
      if (!dataByRep[rep][exp]) dataByRep[rep][exp] = [];
      dataByRep[rep][exp].push(d);
    });
    // Sort each array by round (ascending)
    Object.values(dataByRep).forEach(expObj => {
      Object.values(expObj).forEach(arr =>
        arr.sort((a, b) => a.round - b.round)
      );
    });
    // 4c) Store independent data
    independentData = rowsInd.sort((a, b) => a.epoch - b.epoch);

    // 4d) Initialize charts & UI once data is ready
    initCharts();
    setupMetricSelector();
    setupIndividualComparison();
  })
  .catch(error => {
    console.error('Error loading or processing CSVs:', error);
    alert('Failed to load data. Please check that data/3clients_newgt_v1.csv, data/3clients_newgt_v2.csv, and data/independent_1500.csv all exist.');
  });

//======== 5) Initialize the Three Experiment Charts ==========
function initCharts() {
  // A) Prepare three Chart.js contexts
  const ctxLoss = document.getElementById('trainingLossChart').getContext('2d');
  const ctxMSE = document.getElementById('testMSEChart').getContext('2d');
  const ctxContrib = document.getElementById('contribChart').getContext('2d');

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'linear',
        title: { display: true, text: 'Epoch' } // was "Round", now "Epoch"
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true, mode: 'nearest', intersect: false }
    },
    onHover: (event, elements, chart) => {
      if (!elements.length) {
        // restore full opacity
        chart.data.datasets.forEach((d, i) => {
          d.borderColor = d.borderColor.slice(0, 7);
        });
        chart.update();
        return;
      }
      const hoveredIndex = elements[0].datasetIndex;
      chart.data.datasets.forEach((d, i) => {
        if (i === hoveredIndex) {
          d.borderColor = d.borderColor.slice(0, 7);
        } else {
          d.borderColor = d.borderColor.slice(0, 7) + '4D'; // ~30% opacity
        }
      });
      chart.update();
    }
  };

  // 5a) Training Loss Chart
  const trainingLossChart = new Chart(ctxLoss, {
    type: 'line',
    data: { datasets: [] },
    options: {
      ...commonOptions,
      scales: {
        ...commonOptions.scales,
        y: { title: { display: true, text: 'Training Loss' } }
      }
    }
  });

  // 5b) Test MSE Chart
  const testMSEChart = new Chart(ctxMSE, {
    type: 'line',
    data: { datasets: [] },
    options: {
      ...commonOptions,
      scales: {
        ...commonOptions.scales,
        y: { title: { display: true, text: 'Test MSE' } }
      }
    }
  });

  // 5c) Client Contribution Chart
  const contribChart = new Chart(ctxContrib, {
    type: 'line',
    data: { datasets: [] },
    options: {
      ...commonOptions,
      scales: {
        ...commonOptions.scales,
        y: { title: { display: true, text: 'Client Contribution' } }
      }
    }
  });

  // Helper function to redraw all three charts
  function updateCharts() {
    // 1) Determine which guests are checked
    const selectedGuests = Array.from(
      document.querySelectorAll('input[name="guest"]:checked')
    ).map(cb => cb.value); // e.g. ['guest_1', 'guest_2']

    // 2) Build the experiment string, e.g. “host+('guest_1','guest_2')”
    let expString;
    if (selectedGuests.length === 0) {
      expString = "host+()";
    } else if (selectedGuests.length === 1) {
      expString = `host+('${selectedGuests[0]}',)`;
    } else {
      const inner = selectedGuests.map(g => `'${g}'`).join(', ');
      expString = `host+(${inner})`;
    }

    // 3) Determine which reps are checked
    const selectedReps = Array.from(
      document.querySelectorAll('input[name="rep"]:checked')
    ).map(cb => +cb.value); // e.g. [1, 2, 3]

    // 4) Build new datasets for each metric
    const lossDatasets = [];
    const mseDatasets = [];
    const contribDatasets = [];

    selectedReps.forEach(rep => {
      const rows = dataByRep[rep]?.[expString];
      if (!rows) return;

      const scenario = getScenarioName(expString);
      const comboColor = comboColors[scenario] || '#000';
      const labelSuffix = ` (Rep ${rep})`;

      // --- Training Loss Points
      const lossPoints = rows.map(r => ({ x: r.round, y: r.training_loss }));
      lossDatasets.push({
        label: scenario + labelSuffix,
        data: lossPoints,
        borderColor: comboColor,
        backgroundColor: comboColor,
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 4
      });

      // --- Test MSE Points
      const msePoints = rows.map(r => ({ x: r.round, y: r.test_mse }));
      mseDatasets.push({
        label: scenario + labelSuffix,
        data: msePoints,
        borderColor: comboColor,
        backgroundColor: comboColor,
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 4
      });

      // --- Client Contributions
      ['host', 'guest_1', 'guest_2', 'guest_3'].forEach(clientKey => {
        const fieldName = `ablation_${clientKey}`; 
        if (rows[0][fieldName] == null || isNaN(rows[0][fieldName])) return;
        // Only plot guest_i if it's checked (host is always included)
        if (clientKey !== 'host' && !selectedGuests.includes(clientKey)) return;

        const clientColor = clientColors[clientKey] || '#000';
        const clientLabel = `${clientNames[clientKey]}${labelSuffix}`;
        const contribPoints = rows.map(r => ({ x: r.round, y: r[fieldName] }));

        contribDatasets.push({
          label: clientLabel,
          data: contribPoints,
          borderColor: clientColor,
          backgroundColor: clientColor,
          borderWidth: 2,
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 4
        });
      });
    });

    // 5) Replace datasets and redraw each chart
    trainingLossChart.data.datasets = lossDatasets;
    testMSEChart.data.datasets = mseDatasets;
    contribChart.data.datasets = contribDatasets;

    trainingLossChart.update();
    testMSEChart.update();
    contribChart.update();

    // 6) Hide the “Loading…” spinner for each experiment chart
    document.querySelectorAll('#trainingLossContainer .chart-wrapper').forEach(el => {
      el.classList.add('loading-hidden');
    });
    document.querySelectorAll('#testMSEContainer .chart-wrapper').forEach(el => {
      el.classList.add('loading-hidden');
    });
    document.querySelectorAll('#contribContainer .chart-wrapper').forEach(el => {
      el.classList.add('loading-hidden');
    });
  }

  // Attach listeners to all “guest” checkboxes
  document.querySelectorAll('input[name="guest"]').forEach(cb =>
    cb.addEventListener('change', updateCharts)
  );
  // Attach listeners to all “rep” checkboxes
  document.querySelectorAll('input[name="rep"]').forEach(cb =>
    cb.addEventListener('change', updateCharts)
  );

  // Initial draw
  updateCharts();
}

//======== 6) Metric Selector (dropdown) Logic ========
function setupMetricSelector() {
  const metricSelect = document.getElementById('metricSelect');
  const descriptionEl = document.getElementById('metricDescription');
  const containers = {
    trainingLoss: document.getElementById('trainingLossContainer'),
    testMSE: document.getElementById('testMSEContainer'),
    contrib: document.getElementById('contribContainer')
  };

  metricSelect.addEventListener('change', () => {
    const selected = metricSelect.value; // "trainingLoss", "testMSE", or "contrib"
    Object.keys(containers).forEach(key => {
      containers[key].classList.toggle('active', key === selected);
    });
    descriptionEl.textContent = descriptions[selected] || '';
  });
}

//======== 7) Individual Comparison Section ===========
function setupIndividualComparison() {
  const clientSelect = document.getElementById('indClientSelect');
  const repSelect = document.getElementById('indRepSelect');
  const ctx = document.getElementById('indivChart').getContext('2d');

  // Extract unique client IDs and reps from independentData
  const clients = Array.from(new Set(independentData.map(d => d.client))).sort();
  const reps = Array.from(new Set(independentData.map(d => d.rep))).sort((a, b) => a - b);

  // Populate client dropdown
  clients.forEach(client => {
    const opt = document.createElement('option');
    opt.value = client;
    const displayNames = {
      host:    'HDB Carpark Data',
      guest_1: 'HDB Housing Data',
      guest_2: 'LTA Traffic Data',
      guest_3: 'Grab Trip Data'
    };
    opt.textContent = displayNames[client] || client;
    clientSelect.appendChild(opt);
  });

  // Populate rep dropdown
  reps.forEach(rep => {
    const opt = document.createElement('option');
    opt.value = rep;
    opt.textContent = `Rep ${rep}`;
    repSelect.appendChild(opt);
  });

  // Initialize Chart.js for “indivChart”
  const indivChart = new Chart(ctx, {
    type: 'line',
    data: { datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Epoch' } // was "Round"
        },
        y: {
          title: { display: true, text: 'MSE' }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true, mode: 'nearest', intersect: false }
      }
    }
  });

  function updateIndivChart() {
    const selClient = clientSelect.value; // e.g. “host” or “guest_2”
    const selRep = +repSelect.value;      // e.g. 1, 2, …

    // Filter independentData for that client & rep
    let subset = independentData.filter(d => d.client === selClient && d.rep === selRep);
    subset.sort((a, b) => a.epoch - b.epoch);

    const points = subset.map(r => ({ x: r.epoch, y: r.mse }));
    const labelName = (() => {
      const displayNames = {
        host:    'HDB Carpark Data',
        guest_1: 'HDB Housing Data',
        guest_2: 'LTA Traffic Data',
        guest_3: 'Grab Trip Data'
      };
      return (displayNames[selClient] || selClient) + ` · Rep ${selRep}`;
    })();
    const color = '#1f77b4';

    indivChart.data.datasets = [
      {
        label: labelName,
        data: points,
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 4
      }
    ];
    indivChart.update();

    // Hide the spinner overlay for the individual chart
    document.querySelectorAll('#comparison .chart-wrapper').forEach(el => {
      el.classList.add('loading-hidden');
    });
  }

  clientSelect.addEventListener('change', updateIndivChart);
  repSelect.addEventListener('change', updateIndivChart);

  // Initial draw
  updateIndivChart();
}
