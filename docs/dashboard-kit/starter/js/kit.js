/* Sample dashboard only. Invented numbers. Swap sample.json for a real feed later. */
(function () {
  const MIX_COLORS = ["#006098", "#154167", "#F6E300", "#D9272D", "#4094A7", "#D2DCE5"];
  const charts = {};

  function pct(value) {
    return `${(Number(value) * 100).toFixed(1)}%`;
  }

  function fillKpis(items) {
    const root = document.getElementById("hero-kpis");
    if (!root) return;
    root.innerHTML = items
      .map(
        (item) => `
      <div class="hero-kpi">
        <div class="hero-value">${item.value}</div>
        <div class="hero-label">${item.label}</div>
        <div class="hero-delta ${item.good ? "up" : "down"}">${item.delta}</div>
      </div>`
      )
      .join("");
  }

  function renderMix(canvasId, legendId, items) {
    const canvas = document.getElementById(canvasId);
    const legend = document.getElementById(legendId);
    if (!canvas || !legend || typeof Chart === "undefined") return;
    const labels = items.map((item) => item.label);
    const values = items.map((item) => item.pct * 100);
    const colors = labels.map((_, idx) => MIX_COLORS[idx % MIX_COLORS.length]);
    legend.innerHTML = items
      .map(
        (item, idx) => `
      <tr>
        <td><span style="color:${colors[idx]}">●</span> ${item.label}</td>
        <td>${pct(item.pct)}</td>
      </tr>`
      )
      .join("");
    if (charts.mix) charts.mix.destroy();
    charts.mix = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "58%",
        plugins: {
          legend: { display: false },
          inlineValueLabels: {
            display: true,
            formatter: (value) => `${Number(value).toFixed(1)}%`,
          },
        },
      },
    });
  }

  function renderBars(canvasId, items) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === "undefined") return;
    if (charts.bars) charts.bars.destroy();
    charts.bars = new Chart(canvas, {
      type: "bar",
      data: {
        labels: items.map((item) => item.label),
        datasets: [
          {
            data: items.map((item) => item.count),
            backgroundColor: "#006098",
            borderWidth: 0,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          inlineValueLabels: {
            display: true,
            formatter: (value) => String(value),
          },
        },
        scales: {
          x: { grid: { color: "#d2dce5" }, ticks: { color: "#154167" } },
          y: { grid: { display: false }, ticks: { color: "#154167" } },
        },
      },
    });
  }

  function renderTrend(canvasId, items) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === "undefined") return;
    if (charts.trend) charts.trend.destroy();
    charts.trend = new Chart(canvas, {
      type: "line",
      data: {
        labels: items.map((item) => item.label),
        datasets: [
          {
            data: items.map((item) => item.value),
            borderColor: "#006098",
            backgroundColor: "rgba(0, 96, 152, 0.12)",
            fill: true,
            tension: 0.25,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          inlineValueLabels: {
            display: true,
            formatter: (value) => `${Number(value).toFixed(1)}%`,
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#154167" } },
          y: { grid: { color: "#d2dce5" }, ticks: { color: "#154167" } },
        },
      },
    });
  }

  function paint(data) {
    const subtitle = document.getElementById("slide-period");
    if (subtitle) subtitle.textContent = data.periods?.at(-1)?.label || "Sample period";
    const scope = document.getElementById("scope-line");
    if (scope) scope.textContent = data.scope;
    fillKpis(data.kpis);
    renderMix("chart-mix", "legend-mix", data.mix);
    renderBars("chart-reasons", data.reasons);
    renderTrend("chart-trend", data.trend);
  }

  async function boot() {
    const response = await fetch("data/sample.json");
    const data = await response.json();
    const tabs = window.__dashboardTabs;
    if (tabs && data.periods) {
      tabs.registerPeriods("scorecard", data.periods);
      tabs.registerPeriods("mix", data.periods);
    }
    paint(data);
  }

  window.addEventListener("dashboard:tab", () => {
    Object.values(charts).forEach((chart) => chart?.resize?.());
  });

  document.addEventListener("DOMContentLoaded", boot);
})();
