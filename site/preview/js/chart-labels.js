/* Print chart values directly on canvas so exported slides do not require hover. */
(function () {
  /* One palette for every chart on the page. Chart scripts had each grown
     their own hex literals, which drifted into teal and orange — neither is a
     Dutch Theme colour. Slots 5-8 are tints of the brand blue and slate so a
     six- or eight-series chart stays inside the brand instead of inventing a
     hue. Keep these in step with the --chart-* tokens in dashboard.css. */
  const BRAND = {
    blue: "#006098",
    navy: "#154167",
    yellow: "#F6E300",
    red: "#D9272D",
    /* Darker than the --muted-2 UI grey on purpose: this slot carries white
       value labels inside bars and band segments, and the lighter grey only
       reached 3.4:1 against white. */
    slate: "#5A6F82",
    sky: "#7FB3D9",
    mist: "#9FC4DE",
    line: "#D2DCE5",
    grid: "#EEF2F6",
  };

  /* Ordered for categorical charts: the four brand colours first, then a
     light tail for the smallest categories. Every slot clears 4.5:1 against
     the ink inkOn() picks for it, which is why there is no mid-tone blue in
     the list — a colour halfway between the two inks fails against both. */
  const CATEGORICAL = [
    BRAND.blue,
    BRAND.navy,
    BRAND.yellow,
    BRAND.red,
    BRAND.slate,
    BRAND.sky,
    BRAND.mist,
    BRAND.line,
  ];

  /* Relative luminance per WCAG 2.1, so label ink follows the colour it sits
     on. The old version matched a hardcoded list of light backgrounds, which
     silently painted white-on-yellow whenever a palette slot changed. */
  function luminance(hex) {
    const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!match) return 0;
    const channels = [0, 2, 4].map((offset) => {
      const part = parseInt(match[1].slice(offset, offset + 2), 16) / 255;
      return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  /* Brand navy on light fills, white on dark ones. The crossover is where the
     two inks contrast equally against the fill — solving
     1.05 / (L + 0.05) = (L + 0.05) / (navy + 0.05) puts it at 0.273, not the
     0.45 this used before, which handed white to fills navy suited better. */
  const INK_CROSSOVER = 0.273;

  function inkOn(background) {
    return luminance(background) > INK_CROSSOVER ? BRAND.navy : "#FFFFFF";
  }

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
    return inkOn(background);
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
            /* A label sitting inside the bar takes its ink from that bar, not
               a fixed white: the tail of the decline ramp is light enough
               that white-on-bar was unreadable. Outside the bar it is on the
               panel, so it stays navy. */
            const barColor = Array.isArray(dataset.backgroundColor)
              ? dataset.backgroundColor[dataIndex]
              : dataset.backgroundColor;
            drawLabel(ctx, text, inside ? element.x - 5 : element.x + 5, element.y, {
              align: inside ? "right" : "left",
              color: inside ? inkOn(barColor) : BRAND.navy,
              size: 9,
            });
            return;
          }

          let labelX = point.x;
          let labelAlign = "center";
          const pointCount = Array.isArray(dataset.data) ? dataset.data.length : 0;
          if (dataset.labelAnchor === "inward" && pointCount > 1 && dataIndex === 0) {
            labelAlign = "left";
            labelX = point.x + 2;
          } else if (dataset.labelAnchor === "inward" && pointCount > 1 && dataIndex === pointCount - 1) {
            labelAlign = "right";
            labelX = point.x - 2;
          }

          drawLabel(ctx, text, labelX, point.y - (dataset.labelOffset || 9), {
            align: labelAlign,
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

  /* Canvases default to the display ratio, which renders pie slices, legends,
     and on-canvas labels soft on 1x screens and in exported slides. The mix
     doughnuts are only ~130 CSS px, and a reader who crops one into a deck
     blows it up about threefold, so two was still soft there. Three is the
     floor for every chart; a higher-density display keeps its own ratio. */
  if (typeof Chart !== "undefined" && Chart.defaults) {
    Chart.defaults.devicePixelRatio = Math.max(window.devicePixelRatio || 1, 3);
  }

  window.DBPalette = { ...BRAND, categorical: CATEGORICAL, inkOn };
  window.__chartLabels = { plugin, compactMoney, compactCount, percent, inkOn };
})();
