/* Print chart values directly on canvas so exported slides do not require hover. */
(function () {
  function compactMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}K`;
    return `$${abs.toFixed(0)}`;
  }

  function compactCount(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${(abs / 1_000).toFixed(1)}K`;
    return abs.toFixed(0);
  }

  function percent(value, digits = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    return `${(n * 100).toFixed(digits)}%`;
  }

  function colorFor(background) {
    const light = ["#f6e300", "#d2dce5", "#e99f41", "#ffffff"];
    return light.includes(String(background || "").toLowerCase()) ? "#154167" : "#ffffff";
  }

  function drawLabel(ctx, text, x, y, options = {}) {
    if (!text) return;
    ctx.save();
    ctx.font = `${options.weight || 700} ${options.size || 10}px futura-pt, Arial, sans-serif`;
    ctx.textAlign = options.align || "center";
    ctx.textBaseline = options.baseline || "middle";
    ctx.fillStyle = options.color || "#154167";
    ctx.shadowColor = options.shadow ? "rgba(255,255,255,0.9)" : "transparent";
    ctx.shadowBlur = options.shadow ? 3 : 0;
    ctx.fillText(String(text), x, y);
    ctx.restore();
  }

  const plugin = {
    id: "inlineValueLabels",
    afterDatasetsDraw(chart, _args, pluginOptions) {
      if (!pluginOptions?.display) return;
      const ctx = chart.ctx;
      const chartType = chart.config.type;

      chart.data.datasets.forEach((dataset, datasetIndex) => {
        if (dataset.inlineLabels === false) return;
        const meta = chart.getDatasetMeta(datasetIndex);
        if (meta.hidden) return;
        const type = dataset.type || meta.type || chartType;
        const formatter = dataset.valueFormatter || pluginOptions.formatter;
        if (typeof formatter !== "function") return;

        meta.data.forEach((element, dataIndex) => {
          const raw = dataset.data[dataIndex];
          const text = formatter(raw, {
            chart,
            dataset,
            datasetIndex,
            dataIndex,
          });
          if (text === null || text === undefined || text === "") return;

          const point = element.tooltipPosition();
          if (type === "doughnut" || type === "pie") {
            const background = Array.isArray(dataset.backgroundColor)
              ? dataset.backgroundColor[dataIndex]
              : dataset.backgroundColor;
            drawLabel(ctx, text, point.x, point.y, {
              color: colorFor(background),
              size: 9,
              shadow: true,
            });
            return;
          }

          if (type === "bar" && chart.options.indexAxis === "y") {
            const width = Math.abs(Number(element.x) - Number(element.base));
            const inside = width > 48;
            drawLabel(ctx, text, inside ? element.x - 5 : element.x + 5, element.y, {
              align: inside ? "right" : "left",
              color: inside ? "#ffffff" : "#154167",
              size: 9,
            });
            return;
          }

          drawLabel(ctx, text, point.x, point.y - (dataset.labelOffset || 9), {
            color: dataset.labelColor || "#154167",
            size: 9,
            shadow: true,
          });
        });
      });
    },
  };

  if (typeof Chart !== "undefined" && typeof Chart.register === "function") {
    Chart.register(plugin);
  }

  window.__chartLabels = { plugin, compactMoney, compactCount, percent };
})();
