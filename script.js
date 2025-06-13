// script.js

document.addEventListener('DOMContentLoaded', () => {
  // 1) Scenario name helper
  function getScenarioName(exp) {
    const count = (exp.match(/guest_/g) || []).length;
    if (count === 0)                return 'Host Only';
    if (count === 3)                return 'Host + LTA + Housing + Grab';
    const parts = [];
    if (exp.includes('guest_1'))    parts.push('LTA');
    if (exp.includes('guest_2'))    parts.push('Housing');
    if (exp.includes('guest_3'))    parts.push('Grab');
    return 'Host + ' + parts.join(' + ');
  }

  // 2) Color & name maps
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
    guest_1: '#d62728',
    guest_2: '#2ca02c',
    guest_3: '#ff7f0e'
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

  // 3) Data holders
  const dataByRep = {};
  let independentData = [];

  // 4) Load CSVs
  Promise.all([
    d3.csv('data/3clients_newgt_v1.csv', d3.autoType),
    d3.csv('data/3clients_newgt_v2.csv', d3.autoType),
    d3.csv('data/independent_1500.csv', d3.autoType)
  ])
    .then(processData)
    .catch(err => {
      console.error(err);
      alert('Failed to load data. Check that data/*.csv all exist.');
    });

  function processData([v1, v2, ind]) {
    // offset the second‐batch reps
    const max1 = d3.max(v1, d => d.repetition);
    v2.forEach(d => d.repetition += max1);

    // merge into dataByRep[rep][experiment]
    v1.concat(v2).forEach(d => {
      dataByRep[d.repetition] = dataByRep[d.repetition] || {};
      const exp = d.experiment;
      dataByRep[d.repetition][exp] = dataByRep[d.repetition][exp] || [];
      dataByRep[d.repetition][exp].push(d);
    });
    // sort each series
    Object.values(dataByRep).forEach(obj =>
      Object.values(obj).forEach(arr =>
        arr.sort((a,b) => a.round - b.round)
      )
    );

    independentData = ind.sort((a,b) => a.epoch - b.epoch);

    initCharts();
    setupMetricSelector();
    setupIndividualComparison();
  }

  // 5) Experiment charts
  function initCharts() {
    const ctxL = document.getElementById('trainingLossChart').getContext('2d');
    const ctxM = document.getElementById('testMSEChart').getContext('2d');
    const ctxC = document.getElementById('contribChart').getContext('2d');

    const common = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { type: 'linear', title: { display: true, text: 'Epoch' } }
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true, mode: 'nearest', intersect: false }
      },
      onHover: (e, elems, chart) => {
        if (!elems.length) {
          chart.data.datasets.forEach(d => d.borderColor = d.borderColor.slice(0,7));
          return chart.update();
        }
        const i = elems[0].datasetIndex;
        chart.data.datasets.forEach((d, idx) => {
          d.borderColor = idx === i
            ? d.borderColor.slice(0,7)
            : d.borderColor.slice(0,7) + '4D';
        });
        chart.update();
      }
    };

    const trainingLossChart = new Chart(ctxL, {
      type: 'line',
      data: { datasets: [] },
      options: {
        ...common,
        scales: {
          ...common.scales,
          y: { title: { display: true, text: 'Training Loss' } }
        }
      }
    });

    const testMSEChart = new Chart(ctxM, {
      type: 'line',
      data: { datasets: [] },
      options: {
        ...common,
        scales: {
          ...common.scales,
          y: { title: { display: true, text: 'Test MSE' } }
        }
      }
    });

    const contribChart = new Chart(ctxC, {
      type: 'line',
      data: { datasets: [] },
      options: {
        ...common,
        scales: {
          ...common.scales,
          y: { title: { display: true, text: 'Client Contribution' } }
        }
      }
    });

    function updateCharts() {
      const metric = document.getElementById('metricSelect').value;

      // build expString to match CSV
      const guests = Array.from(
        document.querySelectorAll('#sidebar input[name="guest"]:checked')
      ).map(cb => cb.value);

      let expString;
      if (guests.length === 0) {
        expString = 'host+()';
      } else if (guests.length === 1) {
        expString = `host+('${guests[0]}',)`;
      } else {
        const inner = guests.map(g => `'${g}'`).join(', ');
        expString = `host+(${inner})`;
      }

      // reps
      let reps = Array.from(
        document.querySelectorAll('#sidebar input[name="rep"]:checked')
      ).map(cb => +cb.value);
      if (!reps.length) reps = [1];

      const lossDS = [], mseDS = [], contribDS = [];

      reps.forEach(rep => {
        const bucket = dataByRep[rep]?.[expString];
        if (!bucket) return;
        const scenario = getScenarioName(expString);
        const color    = comboColors[scenario] || '#000';
        const suffix   = ` (Rep ${rep})`;

        lossDS.push({
          label: scenario + suffix,
          data: bucket.map(r => ({ x: r.round, y: r.training_loss })),
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2,
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 4
        });

        mseDS.push({
          label: scenario + suffix,
          data: bucket.map(r => ({ x: r.round, y: r.test_mse })),
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2,
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 4
        });

        ['host','guest_1','guest_2','guest_3'].forEach(k => {
          const fn = `ablation_${k}`;
          if (bucket[0][fn] == null) return;
          if (k !== 'host' && !guests.includes(k)) return;
          contribDS.push({
            label: clientNames[k] + suffix,
            data: bucket.map(r => ({ x: r.round, y: r[fn] })),
            borderColor: clientColors[k],
            backgroundColor: clientColors[k],
            borderWidth: 2,
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 4
          });
        });
      });

      if (metric === 'trainingLoss') {
        trainingLossChart.data.datasets = lossDS;
        trainingLossChart.update();
      } else if (metric === 'testMSE') {
        testMSEChart.data.datasets = mseDS;
        testMSEChart.update();
      } else {
        contribChart.data.datasets = contribDS;
        contribChart.update();
      }

      document.querySelectorAll('.chart-wrapper').forEach(w =>
        w.classList.add('loading-hidden')
      );
    }

    // listen only on desktop (#sidebar) controls
    document
      .querySelectorAll('#sidebar input[name="guest"], #sidebar input[name="rep"]')
      .forEach(cb => cb.addEventListener('change', updateCharts));

    document.getElementById('metricSelect')
      .addEventListener('change', updateCharts);

    updateCharts();
  }

  // 6) Metric selector UI
  function setupMetricSelector() {
    const sel = document.getElementById('metricSelect');
    const desc = document.getElementById('metricDescription');
    const ctrs = {
      trainingLoss: document.getElementById('trainingLossContainer'),
      testMSE:      document.getElementById('testMSEContainer'),
      contrib:      document.getElementById('contribContainer')
    };

    sel.addEventListener('change', () => {
      Object.entries(ctrs).forEach(([k, el]) =>
        el.classList.toggle('active', k === sel.value)
      );
      desc.textContent = descriptions[sel.value];
    });
  }

  // 7) Individual comparison
  function setupIndividualComparison() {
    const clientSelect = document.getElementById('indClientSelect');
    const repSelect    = document.getElementById('indRepSelect');
    const ctx          = document.getElementById('indivChart').getContext('2d');
    const namesMap     = {
      host:    'HDB Carpark Data',
      guest_1: 'HDB Housing Data',
      guest_2: 'LTA Traffic Data',
      guest_3: 'Grab Trip Data'
    };

    // populate dropdowns
    Array.from(new Set(independentData.map(d => d.client)))
      .sort()
      .forEach(c => {
        const o = document.createElement('option');
        o.value = c;
        o.textContent = namesMap[c];
        clientSelect.appendChild(o);
      });
    Array.from(new Set(independentData.map(d => d.rep)))
      .sort((a, b) => a - b)
      .forEach(r => {
        const o = document.createElement('option');
        o.value = r;
        o.textContent = `Rep ${r}`;
        repSelect.appendChild(o);
      });

    const indivChart = new Chart(ctx, {
      type: 'line',
      data: { datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { type: 'linear', title: { display: true, text: 'Epoch' } },
          y: { title: { display: true, text: 'MSE' } }
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true, mode: 'nearest', intersect: false }
        }
      }
    });

    function updateIndiv() {
      const c = clientSelect.value, r = +repSelect.value;
      const subset = independentData
        .filter(d => d.client === c && d.rep === r)
        .sort((a, b) => a.epoch - b.epoch);

      indivChart.data.datasets = [{
        label: `${namesMap[c]} · Rep ${r}`,
        data: subset.map(d => ({ x: d.epoch, y: d.mse })),
        borderColor: '#1f77b4',
        backgroundColor: '#1f77b4',
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 4
      }];
      indivChart.update();
      document.querySelectorAll('#comparison .chart-wrapper').forEach(w =>
        w.classList.add('loading-hidden')
      );
    }

    clientSelect.addEventListener('change', updateIndiv);
    repSelect.addEventListener('change', updateIndiv);
    updateIndiv();
  }
});
