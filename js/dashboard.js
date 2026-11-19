/* Water & Climate Risk Monitor
 * Reads window.MONITOR_DATA (written by pipeline/fetch_data.py) and renders
 * KPIs, findings, charts, tables and data notes. No numbers are typed in here:
 * everything is computed from the data, so a pipeline refresh updates the page.
 */

const DATA = window.MONITOR_DATA;

const COUNTRIES = [
  { code: "USA", name: "United States", color: "--usa" },
  { code: "MEX", name: "Mexico", color: "--mex" },
  { code: "CAN", name: "Canada", color: "--can" },
];
const SECTORS = [
  { key: "agriculture", name: "Agriculture", color: "--sector-agriculture" },
  { key: "industry", name: "Industry", color: "--sector-industry" },
  { key: "municipal", name: "Municipal & other", color: "--sector-municipal" },
];
const NAME = Object.fromEntries(COUNTRIES.map(c => [c.code, c.name]));
const SHORT = {
  water_stress: "water stress",
  water_per_capita: "renewable water per person",
  withdrawal_agriculture: "agriculture's share of water withdrawals",
  withdrawal_industry: "industry's share of water withdrawals",
  methane: "methane emissions",
  disaster_displacement: "disaster displacements",
};

// ---------- data helpers ----------

const index = new Map(DATA.rows.map(r => [`${r.indicator}|${r.country}|${r.year}`, r]));
const row = (key, country, year) => index.get(`${key}|${country}|${year}`);
const val = (key, country, year) => row(key, country, year)?.value ?? null;
const rowsFor = (key, country) => DATA.rows.filter(r => r.indicator === key && r.country === country);
const latest = (key, country) => rowsFor(key, country).at(-1);
const first = (key, country) => rowsFor(key, country)[0];
const years = key => {
  const ys = DATA.rows.filter(r => r.indicator === key).map(r => r.year);
  const out = [];
  for (let y = Math.min(...ys); y <= Math.max(...ys); y++) out.push(y);
  return out;
};
const pctChange = (key, country, y0, y1) => (val(key, country, y1) / val(key, country, y0) - 1) * 100;

// ---------- formatting ----------

const fmt = (n, d = 1) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (n, d = 1) => `${n >= 0 ? "+" : "−"}${fmt(Math.abs(n), d)}%`;
const compact = n => n >= 1e6 ? `${fmt(n / 1e6, 2)}M` : n >= 1e3 ? `${fmt(n / 1e3, 0)}k` : fmt(n, 0);
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const $ = id => document.getElementById(id);

// ---------- header, KPIs, findings, notes ----------

function renderText() {
  const meta = DATA.indicators;
  const latestYears = Object.values(meta).map(m => m.latest_year);
  $("meta").textContent =
    `Data fetched ${DATA.fetched_at} · latest available years ${Math.min(...latestYears)}–${Math.max(...latestYears)}`;

  document.querySelectorAll("[data-source]").forEach(el => {
    const m = meta[el.dataset.source];
    el.textContent = `Source: ${m.source_short} via World Bank API (${m.code}), updated ${m.source_last_updated}.`;
    el.title = m.source;
  });

  // KPI: Mexico water stress
  const mxStress = latest("water_stress", "MEX");
  const mxStress0 = first("water_stress", "MEX");
  $("kpi-stress").textContent = `${fmt(mxStress.value)}%`;
  $("kpi-stress-note").textContent =
    `${mxStress.year} · ${fmt(mxStress0.value)}% in ${mxStress0.year} · US ${fmt(latest("water_stress", "USA").value)}%, Canada ${fmt(latest("water_stress", "CAN").value)}%`;

  // KPI: Mexico water per person
  const pc = latest("water_per_capita", "MEX"), pc0 = first("water_per_capita", "MEX");
  $("kpi-percap").textContent = signed(pctChange("water_per_capita", "MEX", pc0.year, pc.year), 0);
  $("kpi-percap-note").textContent =
    `${fmt(pc.value, 0)} m³ in ${pc.year} vs ${fmt(pc0.value, 0)} m³ in ${pc0.year}`;

  // KPI: Mexico methane
  const ch = latest("methane", "MEX"), ch0 = first("methane", "MEX");
  const chg = c => signed(pctChange("methane", c, ch0.year, ch.year));
  $("kpi-methane").textContent = chg("MEX");
  $("kpi-methane-note").textContent = `${ch0.year}–${ch.year} · US ${chg("USA")}, Canada ${chg("CAN")}`;

  // Findings
  const mix = withdrawalMix();
  const m = mix.MEX, u = mix.USA, c = mix.CAN;
  const disp = Object.fromEntries(COUNTRIES.map(k => {
    const rs = rowsFor("disaster_displacement", k.code);
    const end = rs.at(-1).year;
    return [k.code, { total: rs.filter(r => r.year > end - 10).reduce((s, r) => s + r.value, 0), start: end - 9, end }];
  }));
  const findings = [
    `<strong>Mexico is the region's water-stress hotspot.</strong> It withdraws ${fmt(mxStress.value)}% of its available freshwater, against ${fmt(latest("water_stress", "USA").value)}% in the US and ${fmt(latest("water_stress", "CAN").value)}% in Canada, just below FAO's 50% "medium stress" line. That is a national average: northern industrial states such as Nuevo León, home to Monterrey's 2022 water shortage, run tighter than this figure shows.`,
    `<strong>In Mexico, industry is a small water user next to farming.</strong> Agriculture takes ${fmt(m.agriculture, 0)}% of withdrawals and industry ${fmt(m.industry, 0)}%, while in the US and Canada industry takes ${fmt(u.industry, 0)}% and ${fmt(c.industry, 0)}%. A plant in Mexico depends on allocation decisions dominated by other users, which is a risk to plan for when siting or nearshoring production.`,
    `<strong>The buffer is shrinking everywhere.</strong> Renewable water per person fell ${fmt(-pctChange("water_per_capita", "MEX", pc0.year, pc.year), 0)}% in Mexico, ${fmt(-pctChange("water_per_capita", "USA", pc0.year, pc.year), 0)}% in the US and ${fmt(-pctChange("water_per_capita", "CAN", pc0.year, pc.year), 0)}% in Canada since ${pc0.year}, driven by population growth on a fixed resource. The same demand growth that brings sales also tightens supply.`,
    `<strong>Mexico's methane is diverging.</strong> Emissions rose ${chg("MEX")} from ${ch0.year} to ${ch.year}, against ${chg("USA")} in the US and ${chg("CAN")} in Canada. For buyers reporting supply chain (Scope 3) emissions, Mexican suppliers are where scrutiny will grow first.`,
    `<strong>Physical disruption hits the US hardest in volume.</strong> Disasters caused ${compact(disp.USA.total)} new displacements in the US over ${disp.USA.start}–${disp.USA.end}, against ${compact(disp.MEX.total)} in Mexico and ${compact(disp.CAN.total)} in Canada. Single storms drive the spikes, which argues for event-driven contingency plans rather than averages.`,
  ];
  $("findings").innerHTML = findings.map(f => `<li>${f}</li>`).join("");

  // Data notes, generated from the pipeline's quality flags
  const notes = [];
  COUNTRIES.forEach(k => {
    const carried = rowsFor("water_stress", k.code).filter(r => r.carried_forward);
    if (carried.length) {
      notes.push(`${k.name}: ${carried.length} water-stress values (${carried.map(r => r.year).join(", ")}) repeat the previous year. AQUASTAT does not measure every country every year, so these are carried forward, not new readings.`);
    }
  });
  DATA.rows.filter(r => r.step_change).forEach(r => {
    const prev = val(r.indicator, r.country, r.year - 1);
    notes.push(`${NAME[r.country]}, ${SHORT[r.indicator]}: jumps from ${fmt(prev)} to ${fmt(r.value)} in ${r.year}. A one-year move this large most likely reflects a revision in the source data, so compare trends across ${r.year} with caution.`);
  });
  notes.push(`Sources publish with a lag: latest water data is ${meta.water_stress.latest_year}, displacement ${meta.disaster_displacement.latest_year}, methane ${meta.methane.latest_year}.`);
  notes.push(`Displacement counts events, not people: one person displaced twice counts twice (IDMC definition).`);
  notes.push(`National figures hide basin-level risk. Next step: add WRI Aqueduct basin data for the Rio Grande/Bravo and northern Mexico.`);
  $("notes").innerHTML = notes.map(n => `<li>${n}</li>`).join("");
}

function withdrawalMix() {
  const out = {};
  COUNTRIES.forEach(({ code }) => {
    const ag = latest("withdrawal_agriculture", code), ind = latest("withdrawal_industry", code);
    const year = Math.min(ag.year, ind.year);
    const a = val("withdrawal_agriculture", code, year), i = val("withdrawal_industry", code, year);
    out[code] = { year, agriculture: a, industry: i, municipal: 100 - a - i };
  });
  return out;
}

// ---------- legends and tables ----------

function renderLegends() {
  const swatch = items => items.map(i => `<span><i style="background:var(${i.color})"></i>${i.name}</span>`).join("");
  document.querySelectorAll(".legend").forEach(el => {
    el.innerHTML = swatch(el.dataset.for === "mix" ? SECTORS : COUNTRIES);
  });
}

function countryTable(id, key, format) {
  const ys = years(key).filter(y => COUNTRIES.some(c => val(key, c.code, y) !== null));
  const head = `<tr><th>Year</th>${COUNTRIES.map(c => `<th>${c.name}</th>`).join("")}</tr>`;
  const body = ys.slice().reverse().map(y => `<tr><td>${y}</td>${COUNTRIES.map(c => {
    const r = row(key, c.code, y);
    return `<td>${r ? format(r.value) + (r.carried_forward ? "*" : "") : "–"}</td>`;
  }).join("")}</tr>`).join("");
  const note = DATA.rows.some(r => r.indicator === key && r.carried_forward)
    ? `<p class="source">* repeated from the previous year by the source</p>` : "";
  $(id).innerHTML = `<table>${head}${body}</table>${note}`;
}

function mixTable(mix) {
  const head = `<tr><th>Country</th><th>Year</th>${SECTORS.map(s => `<th>${s.name}</th>`).join("")}</tr>`;
  const body = COUNTRIES.map(c => `<tr><td>${c.name}</td><td>${mix[c.code].year}</td>${SECTORS.map(s => `<td>${fmt(mix[c.code][s.key])}%</td>`).join("")}</tr>`).join("");
  $("table-mix").innerHTML = `<table>${head}${body}</table>`;
}

// ---------- charts ----------

// Horizontal reference lines (FAO stress thresholds), drawn under the data.
const thresholdPlugin = {
  id: "thresholds",
  beforeDatasetsDraw(chart, _args, opts) {
    if (!opts?.lines) return;
    const { ctx, chartArea: a, scales: { y } } = chart;
    ctx.save();
    opts.lines.forEach(l => {
      const py = y.getPixelForValue(l.value);
      if (py < a.top || py > a.bottom) return;
      ctx.strokeStyle = css("--threshold");
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a.left, py); ctx.lineTo(a.right, py); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = css("--text-muted");
      ctx.font = "12px 'Schibsted Grotesk', system-ui, sans-serif";
      ctx.textAlign = "right";
      if (l.label) ctx.fillText(l.label, a.right - 4, l.below ? py + 16 : py - 6);
    });
    ctx.restore();
  },
};

// Marks values the pipeline flagged as step changes (likely data revisions).
const flagPlugin = {
  id: "flags",
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts?.points?.length) return;
    const { ctx } = chart;
    ctx.save();
    opts.points.forEach(p => {
      const meta = chart.getDatasetMeta(p.datasetIndex);
      const el = meta.data[p.index];
      if (!el || meta.hidden) return;
      ctx.strokeStyle = css("--text-secondary");
      ctx.fillStyle = css("--panel");
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(el.x, el.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = css("--text-secondary");
      ctx.font = "12px 'Schibsted Grotesk', system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(p.label, el.x - 10, el.y - 10);
    });
    ctx.restore();
  },
};

// Vertical guide line at the hovered year.
const crosshairPlugin = {
  id: "crosshair",
  afterDraw(chart) {
    const active = chart.tooltip?.getActiveElements?.();
    if (!active?.length || chart.config.type !== "line") return;
    const { ctx, chartArea: a } = chart;
    const x = active[0].element.x;
    ctx.save();
    ctx.strokeStyle = css("--threshold");
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, a.top); ctx.lineTo(x, a.bottom); ctx.stroke();
    ctx.restore();
  },
};

Chart.register(thresholdPlugin, flagPlugin, crosshairPlugin);

function baseOptions() {
  Chart.defaults.font.family = "'Schibsted Grotesk', system-ui, sans-serif";
  Chart.defaults.color = css("--text-secondary");
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: css("--bg"),
        titleColor: css("--text-primary"),
        bodyColor: css("--text-primary"),
        borderColor: css("--border"),
        borderWidth: 1,
        padding: 10,
        boxPadding: 4,
        usePointStyle: true,
      },
    },
    scales: {
      x: { grid: { display: false }, border: { color: css("--border") }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
      y: { grid: { color: css("--grid") }, border: { display: false } },
    },
  };
}

function lineDataset(key, country, transform = v => v) {
  const ys = years(key);
  return {
    label: country.name,
    data: ys.map(y => { const v = val(key, country.code, y); return v === null ? null : transform(v, y); }),
    borderColor: css(country.color),
    backgroundColor: css(country.color),
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 5,
    pointHitRadius: 10,
    pointHoverBorderColor: css("--panel"),
    pointHoverBorderWidth: 2,
    spanGaps: false,
    // Dashed where the source repeated the previous year's value.
    segment: { borderDash: ctx => row(key, country.code, ys[ctx.p1DataIndex])?.carried_forward ? [4, 4] : undefined },
  };
}

const charts = [];

function renderCharts() {
  charts.splice(0).forEach(c => c.destroy());

  // 1. Water stress
  const stressYears = years("water_stress");
  const stressOpts = baseOptions();
  stressOpts.scales.y.min = 0;
  stressOpts.scales.y.max = 60;
  stressOpts.scales.y.ticks = { callback: v => `${v}%` };
  stressOpts.plugins.thresholds = { lines: [{ value: 25, label: "Low stress (25%)", below: true }, { value: 50, label: "Medium stress (50%)" }] };
  stressOpts.plugins.flags = {
    points: DATA.rows.filter(r => r.indicator === "water_stress" && r.step_change).map(r => ({
      datasetIndex: COUNTRIES.findIndex(c => c.code === r.country),
      index: stressYears.indexOf(r.year),
      label: "Likely data revision",
    })),
  };
  stressOpts.plugins.tooltip.callbacks = {
    label: ctx => {
      const r = row("water_stress", COUNTRIES[ctx.datasetIndex].code, stressYears[ctx.dataIndex]);
      return ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}%${r?.carried_forward ? " (repeated)" : ""}`;
    },
  };
  charts.push(new Chart($("chart-stress"), {
    type: "line",
    data: { labels: stressYears, datasets: COUNTRIES.map(c => lineDataset("water_stress", c)) },
    options: stressOpts,
  }));

  // 2. Withdrawal mix (stacked horizontal bars)
  const mix = withdrawalMix();
  const mixOpts = baseOptions();
  mixOpts.indexAxis = "y";
  mixOpts.interaction = { mode: "nearest", intersect: true };
  mixOpts.scales.x = { stacked: true, max: 100, grid: { color: css("--grid") }, border: { display: false }, ticks: { callback: v => `${v}%` } };
  mixOpts.scales.y = { stacked: true, grid: { display: false }, border: { display: false } };
  mixOpts.plugins.tooltip.callbacks = { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.x)}%` };
  charts.push(new Chart($("chart-mix"), {
    type: "bar",
    data: {
      labels: COUNTRIES.map(c => c.name),
      datasets: SECTORS.map(s => ({
        label: s.name,
        data: COUNTRIES.map(c => mix[c.code][s.key]),
        backgroundColor: css(s.color),
        borderColor: css("--panel"),
        borderWidth: 2,
        borderSkipped: false,
        barPercentage: 0.7,
      })),
    },
    options: mixOpts,
  }));
  mixTable(mix);

  // 3 & 4. Indexed lines (2000 = 100)
  const indexed = (canvas, key, unit, digits) => {
    const ys = years(key);
    const base = Math.min(...ys);
    const opts = baseOptions();
    opts.plugins.tooltip.callbacks = {
      label: ctx => {
        const c = COUNTRIES[ctx.datasetIndex];
        return ` ${c.name}: ${fmt(ctx.parsed.y)} (${fmt(val(key, c.code, ys[ctx.dataIndex]), digits)} ${unit})`;
      },
    };
    opts.plugins.thresholds = { lines: [{ value: 100 }] };  // the subtitle names the base year
    charts.push(new Chart($(canvas), {
      type: "line",
      data: { labels: ys, datasets: COUNTRIES.map(c => lineDataset(key, c, v => v / val(key, c.code, base) * 100)) },
      options: opts,
    }));
  };
  indexed("chart-percap", "water_per_capita", "m³ per person", 0);
  indexed("chart-methane", "methane", "Mt CO2e", 1);

  // 5. Disaster displacement (grouped bars)
  const dYears = years("disaster_displacement");
  const dOpts = baseOptions();
  dOpts.scales.y.ticks = { callback: v => (v >= 1e6 ? `${v / 1e6}M` : compact(v)) };
  dOpts.plugins.tooltip.callbacks = { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y === null ? "no data" : fmt(ctx.parsed.y, 0)}` };
  charts.push(new Chart($("chart-displacement"), {
    type: "bar",
    data: {
      labels: dYears,
      datasets: COUNTRIES.map(c => ({
        label: c.name,
        data: dYears.map(y => val("disaster_displacement", c.code, y)),
        backgroundColor: css(c.color),
        borderRadius: 4,
        categoryPercentage: 0.8,
        barPercentage: 0.9,
      })),
    },
    options: dOpts,
  }));
}

function renderTables() {
  countryTable("table-stress", "water_stress", v => `${fmt(v)}%`);
  countryTable("table-percap", "water_per_capita", v => fmt(v, 0));
  countryTable("table-methane", "methane", v => fmt(v));
  countryTable("table-displacement", "disaster_displacement", v => fmt(v, 0));
}

renderText();
renderLegends();
renderTables();
renderCharts();

// Redraw with the right palette when the OS switches light/dark.
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderCharts);
