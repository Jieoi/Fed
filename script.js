// script.js

// Mapping from “experiment string” to a human-readable scenario name
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

// Colors for each combination
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

// Colors for each client in contribution plot
const clientColors = {
  host:    '#000000',
  guest_1: '#d62728',  // LTA
  guest_2: '#2ca02c',  // Housing
  guest_3: '#ff7f0e'   // Grab
};

// Human-readable names for each client
const clientNames = {
  host:    'HDB Carpark',
  guest_1: 'LTA',
  guest_2: 'HDB Housing',
  guest_3: 'Grab'
};

// Descriptions for each metric (non-technical)
const descriptions = {
  trainingLoss: 'Shows how well the model is fitting the training data; lower values indicate a better fit.',
  testMSE:      'Shows prediction error on unseen data; lower values mean the model generalizes more accurately.',
  contrib:      'Shows each client’s impact on the model’s performance; larger values indicate greater contribution.'
};

// Container for all rows grouped by repetition → experiment
const dataByRep = {};
let independentData = [];

// STEP 1: Load FL CSVs, then offset + concatenate, plus independent.csv
Promise.all([
  d3.csv('data/3clients_newgt_v1.csv', d3.autoType),
  d3.csv('data/3clients_newgt_v2.csv', d3.autoType),
  d3.csv('data/independent_1500.csv', d3.autoType)
]).then(([rowsV1, rowsV2, rowsInd]) => {
  // Prepare federated data
  const maxRepV1 = d3.max(rowsV1, d => d.repetition);
  rowsV2.forEach(d => {
    d.repetition = d.repetition + maxRepV1;
  });
  const allRows = rowsV1.concat(rowsV2);
  allRows.forEach(d => {
    const rep = d.repetition, exp = d.experiment;
    if (!dataByRep[rep]) dataByRep[rep] = {};
    if (!dataByRep[rep][exp]) dataByRep[rep][exp] = [];
    dataByRep[rep][exp].push(d);
  });
  Object.values(dataByRep).forEach(expObj => {
    Object.values(expObj).forEach(arr => arr.sort((a,b) => a.round - b.round));
  });

  // Store independent data
  independentData = rowsInd;

  // Initialize charts and UI
  initCharts();
  setupMetricSelector();
  setupIndividualComparison();
}).catch(error => {
  console.error('Error loading or processing CSVs:', error);
});

function initCharts() {
  // Create three Chart.js instances: training-loss, test-MSE, and contribution
  const ctx1 = document.getElementById('trainingLossChart').getContext('2d');
  const ctx2 = document.getElementById('testMSEChart').getContext('2d');
  const ctx3 = document.getElementById('contribChart').getContext('2d');

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'linear',
        title: { display: true, text: 'Epoch' }       // changed from "Round" to "Epoch"
      }
    },
    plugins: {
      legend: { display: false }
    },
    onHover: (event, elements, chart) => {
      if (!elements.length) {
        chart.data.datasets.forEach(d => {
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
          d.borderColor = d.borderColor.slice(0, 7) + '4D';
        }
      });
      chart.update();
    }
  };

  const trainingLossChart = new Chart(ctx1, {
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

  const testMSEChart = new Chart(ctx2, {
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

  const contribChart = new Chart(ctx3, {
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

  function updateCharts() {
    const selectedGuests = Array.from(
      document.querySelectorAll('input[name="guest"]:checked')
    ).map(cb => cb.value);

    let expString;
    if (selectedGuests.length === 0) {
      expString = "host+()";
    } else if (selectedGuests.length === 1) {
      expString = `host+('${selectedGuests[0]}',)`;
    } else {
      const inner = selectedGuests.map(g => `'${g}'`).join(', ');
      expString = `host+(${inner})`;
    }

    const selectedReps = Array.from(
      document.querySelectorAll('input[name="rep"]:checked')
    ).map(cb => +cb.value);

    const lossDatasets = [];
    const mseDatasets = [];
    const contribDatasets = [];

    selectedReps.forEach(rep => {
      const rows = dataByRep[rep]?.[expString];
      if (!rows) return;

      const scenarioName = getScenarioName(expString);
      const comboColor = comboColors[scenarioName] || '#000';
      const labelSuffix = ` (Rep ${rep})`;

      // Training Loss
      const lossPoints = rows.map(r => ({ x: r.round, y: r.training_loss }));
      lossDatasets.push({
        label: scenarioName + labelSuffix,
        data: lossPoints,
        borderColor: comboColor,
        backgroundColor: comboColor,
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 4
      });

      // Test MSE
      const msePoints = rows.map(r => ({ x: r.round, y: r.test_mse }));
      mseDatasets.push({
        label: scenarioName + labelSuffix,
        data: msePoints,
        borderColor: comboColor,
        backgroundColor: comboColor,
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 4
      });

      // Client Contributions
      ['host', 'guest_1', 'guest_2', 'guest_3'].forEach(clientKey => {
        const fieldName = `ablation_${clientKey}`;
        if (isNaN(rows[0][fieldName])) return;
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

    trainingLossChart.data.datasets = lossDatasets;
    testMSEChart.data.datasets = mseDatasets;
    contribChart.data.datasets = contribDatasets;
    trainingLossChart.update();
    testMSEChart.update();
    contribChart.update();
  }

  // Attach checkbox listeners
  document.querySelectorAll('input[name="guest"]').forEach(cb =>
    cb.addEventListener('change', updateCharts)
  );
  document.querySelectorAll('input[name="rep"]').forEach(cb =>
    cb.addEventListener('change', updateCharts)
  );

  // Initial drawing
  updateCharts();
}

// Set up dropdown logic for selecting which metric to display
function setupMetricSelector() {
  const metricSelect = document.getElementById('metricSelect');
  const descriptionEl = document.getElementById('metricDescription');

  const containers = {
    trainingLoss: document.getElementById('trainingLossContainer'),
    testMSE:      document.getElementById('testMSEContainer'),
    contrib:      document.getElementById('contribContainer')
  };

  metricSelect.addEventListener('change', () => {
    const selected = metricSelect.value;
    Object.keys(containers).forEach(key => {
      containers[key].classList.toggle('active', key === selected);
    });
    descriptionEl.textContent = descriptions[selected] || '';
  });
}

// Set up individual-comparison section
function setupIndividualComparison() {
  const clientSelect = document.getElementById('indClientSelect');
  const repSelect = document.getElementById('indRepSelect');
  const ctx = document.getElementById('indivChart').getContext('2d');

  // Extract unique clients and reps from independentData
  const clients = Array.from(new Set(independentData.map(d => d.client))).sort();
  const reps    = Array.from(new Set(independentData.map(d => d.rep))).sort((a,b)=>a-b);

  // Populate client dropdown
  clients.forEach(client => {
    const opt = document.createElement('option');
    opt.value = client;
    const displayNames = {
      host:    "HDB Carpark Data",
      guest_1: "HDB Housing Data",
      guest_2: "LTA Traffic Data",
      guest_3: "Grab Trip Data"
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

  // Create the Chart.js instance for the individual comparison
  const indivChart = new Chart(ctx, {
    type: 'line',
    data: { datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Epoch' }   // changed from "Round" to "Epoch"
        },
        y: {
          title: { display: true, text: 'MSE' }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });

  function updateIndivChart() {
    const selClient = clientSelect.value;
    const selRep    = +repSelect.value;

    // Filter rows for selected client and rep
    let subset = independentData.filter(d => d.client === selClient && d.rep === selRep);
    subset.sort((a, b) => a.epoch - b.epoch);

    const points = subset.map(r => ({ x: r.epoch, y: r.mse }));
    const labelName = (() => {
      const displayNames = {
        host:    "HDB Carpark Data",
        guest_1: "HDB Housing Data",
        guest_2: "LTA Traffic Data",
        guest_3: "Grab Trip Data"
      };
      return (displayNames[selClient] || selClient) + ` · Rep ${selRep}`;
    })();
    const color = '#1f77b4';

    indivChart.data.datasets = [{
      label: labelName,
      data: points,
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      fill: false,
      pointRadius: 0,
      pointHoverRadius: 4
    }];
    indivChart.update();
  }

  clientSelect.addEventListener('change', updateIndivChart);
  repSelect.addEventListener('change', updateIndivChart);

  // Initial draw
  updateIndivChart();
}
