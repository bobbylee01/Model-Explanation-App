// Static regression teaching dashboard. Model calculations live in m10.js.
import * as m10 from "./m10.js";

const LABELS = { glucose: "Fasting glucose", sbp: "Blood pressure", fev1: "Lung function (FEV₁)" };
const state = { key: "glucose", person: "P1", values: null };
const $ = (id) => document.getElementById(id);
const fmt = (v, d = 1) => Number(v).toFixed(d);
const signed = (v, d = 1) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d);

function section() {
  const s = location.hash.slice(1);
  return ["linear", "forest", "boosting"].includes(s) ? s : "linear";
}

let renderRequest = 0;

async function setup() {
  document.querySelector(".skip-link").onclick = (e) => {
    e.preventDefault();
    $("section").focus();
  };
  $("dataset").innerHTML = m10.DATASETS.map((k) => `<option value="${k}">${LABELS[k]}</option>`).join("");
  $("dataset").onchange = (e) => {
    state.key = e.target.value;
    state.person = "P1";
    state.values = null;
    render();
  };
  $("person").onchange = (e) => { state.person = e.target.value; state.values = null; render(); };
  window.onhashchange = render;
  await render();
}

async function render() {
  // A slow earlier fetch must never overwrite the latest dataset/person/model.
  const request = ++renderRequest;
  const key = state.key, personId = state.person, model = section();
  document.querySelectorAll("nav a").forEach((a) => {
    const active = a.hash === "#" + model;
    a.classList.toggle("active", active);
    if (active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  $("section").setAttribute("aria-busy", "true");
  $("section").inert = true;
  $("selection-context").textContent = "Loading supplied examples...";
  try {
    const b = await m10.loadBundle(key);
    if (request !== renderRequest) return;
    const person = b.people.find((p) => p.id === personId);
    if (!person) throw new Error("Missing supplied participant");
    $("person").innerHTML = b.people.map((p) => `<option value="${p.id}">${p.label}: ${p.description}</option>`).join("");
    $("person").value = personId;
    $("selection-context").textContent = `${b.target_label} (${b.units}) / ${person.label}: ${person.description}. Switch models to follow the same participant.`;
    if (!state.values) state.values = { ...person.values };
    const draw = { linear: renderLinear, forest: renderForest, boosting: renderBoosting }[model];
    draw(b, person);
  } catch (error) {
    if (request !== renderRequest) return;
    $("selection-context").textContent = "The selected example could not be loaded.";
    $("section").innerHTML = `<div class="linear-card" role="alert"><h2>Unable to load this example</h2><p>Check your connection and that the outputs folder is included with the site. For a local preview, serve this folder over HTTP rather than opening index.html directly.</p><button type="button" id="load-retry">Reload page and retry</button></div>`;
    $("load-retry").onclick = () => location.reload();
    console.error("Unable to display supplied model data:", error);
  } finally {
    if (request === renderRequest) {
      $("section").setAttribute("aria-busy", "false");
      $("section").inert = false;
    }
  }
}

const featureLabel = (b, name) => (b.features.find((f) => f.name === name) || { label: name }).label;

// ---- Push & Pull -------------------------------------------------------------
// All displayed contributions are computed by the instructor's helper.
function renderLinear(b, person = b.people.find((p) => p.id === state.person)) {
  const groups = b.categorical_groups;
  const grouped = new Set(groups.flatMap((g) => g.levels.filter((lv) => lv.column).map((lv) => lv.column)));
  const numeric = b.features.filter((f) => !grouped.has(f.name));
  $("section").innerHTML = `<article class="linear-section">
    <h2><span class="model-tag">01 / LINEAR REGRESSION</span>Push &amp; Pull</h2>
    <p class="linear-intro">Rebuild a linear prediction: start at the training average, then add each feature's signed push.</p>
    <div class="linear-card">
      <h3>Explore ${person.label.toLowerCase()}</h3>
      <p>${person.description}. Edit the values to explore the model's associations, holding the other features fixed.</p>
      <div class="inputs">
        ${numeric.map((f) => {
          const s = b.feature_stats[f.name];
          return `<label>${f.label} (${f.units})<input required type="number" data-f="${f.name}" value="${state.values[f.name]}" min="${s.min}" max="${s.max}" step="any" aria-describedby="linear-input-help"><span class="note">Range: ${s.min} to ${s.max} ${f.units}</span></label>`;
        }).join("")}
        ${groups.map((g) => `<label>${g.label}<select data-g="${g.name}">${g.levels.map((lv) => `<option ${lv.label === m10.categoryOf(b, g.name, state.values) ? "selected" : ""}>${lv.label}</option>`).join("")}</select><span class="note">Coding reference group: ${g.reference}</span></label>`).join("")}
      </div>
      <p id="linear-input-help" class="note">Use a number within each displayed range. Results retain the last valid value while an entry is incomplete or outside its range.</p>
      <button type="button" id="linear-reset">Reset to supplied person</button>
    </div>
    <p id="linear-announcement" class="sr-only" role="status" aria-live="polite"></p>
    <div id="linear-results"></div>
    <div class="linear-card">
      <h3>Coefficient versus this person's push</h3>
      <p>A <strong>coefficient</strong> is the model's predicted difference per one unit of a feature, holding other features fixed. A <strong>push</strong> also depends on how far this person's value is from the training average:</p>
      <p><strong>push = coefficient &times; (value &minus; training average)</strong></p>
      <div id="linear-coefficients"></div>
      <p>Category coefficients compare a category with its <strong>coding reference group</strong>. Category pushes instead compare with the <strong>training mix</strong>, combining all indicator columns into one push. Even someone in the reference group can have a nonzero push.</p>
      <details><summary>Category coefficient comparisons (${b.units})</summary>
        ${groups.map((g) => `<p><strong>${g.label}</strong>: ${g.levels.filter((lv) => lv.column).map((lv) => `${lv.label} versus ${g.reference}: ${signed(b.linear.coefficients[lv.column], 3)} ${b.units}`).join("; ")}, holding the other features fixed.</p>`).join("")}
      </details>
      <p><strong>A large personal push is not overall importance.</strong> It reflects this person's distance from the training average as well as the coefficient. For numeric features, an overall comparison uses coefficient &times; training standard deviation (a typical one-standard-deviation difference), rather than raw coefficients with different units.</p>
      <p class="note">These are model associations, not causal effects or treatment advice.</p>
    </div>
  </article>`;
  const update = () => updateLinearResults(b, person, numeric);
  document.querySelectorAll("[data-f]").forEach((el) => {
    el.oninput = () => {
      el.setAttribute("aria-invalid", String(!el.validity.valid));
      if (!el.validity.valid || !Number.isFinite(el.valueAsNumber)) return;
      state.values[el.dataset.f] = el.valueAsNumber;
      update();
    };
  });
  document.querySelectorAll("[data-g]").forEach((el) => {
    el.onchange = () => {
      Object.assign(state.values, m10.categoryInputs(b, el.dataset.g, el.value));
      update();
    };
  });
  $("linear-reset").onclick = () => { state.values = { ...person.values }; renderLinear(b, person); };
  update();
}

function updateLinearResults(b, person, numeric) {
  const ex = m10.linearExplain(b, state.values);
  const u = b.units;
  const edited = b.features.some((f) => state.values[f.name] !== person.values[f.name]);
  const entries = Object.entries(ex.groupedPushes).map(([name, push]) => ({
    name, push, label: b.categorical_groups.find((g) => g.name === name)?.label || featureLabel(b, name)
  }));
  $("linear-announcement").textContent = `${edited ? "Edited inputs" : person.label}: prediction ${fmt(ex.prediction)} ${u}.`;
  const upward = entries.filter((e) => e.push > 0).sort((a, c) => c.push - a.push)[0];
  $("linear-results").innerHTML = `<section class="linear-card" aria-labelledby="linear-chart-title">
    <h3 id="linear-chart-title">From starting point to prediction</h3>
    <p id="linear-summary">${edited ? "Edited inputs" : person.label}: prediction <strong>${fmt(ex.prediction)} ${u}</strong>. Starting point: ${fmt(ex.baseline)} ${u}.</p>
    <p>The starting point is the prediction at the training-average inputs, including the average category mix. It is not the intercept.</p>
    <p class="note">Read top to bottom. Each floating bar starts where the previous row ends. + Up adds to the running prediction; &minus; Down subtracts. Baseline and final bars start at zero.</p>
    <div class="linear-chart-scroll" tabindex="0" role="region" aria-label="Waterfall chart; scroll horizontally on small screens">${linearWaterfall(ex, entries, u)}</div>
    <p>${upward ? `Biggest upward push: <strong>${upward.label} (${signed(upward.push)} ${u})</strong>.` : "There are no upward pushes for these inputs."} Values are rounded for display; the sum uses full precision.</p>
    <p>${edited ? "Original supplied person's" : "Supplied person's"} measured outcome: <strong>${fmt(person.observed)} ${u}</strong>${edited ? "; this measurement does not belong to the edited inputs" : ""}.</p>
    ${b.id === "fev1" && person.id === "P1" ? `<p class="linear-caution">Why the large mismatch? The supplied person is a 9-year-old. One straight line cannot follow lung growth in childhood and decline later in life. The original prediction is far above the measured value; this is a limitation of the model.</p>` : ""}
  </section>`;
  $("linear-coefficients").innerHTML = `<div class="linear-table-scroll" tabindex="0" role="region" aria-label="Numeric coefficients and personal pushes; scroll horizontally on small screens"><table><caption>Numeric coefficients and current personal pushes</caption><thead><tr><th scope="col">Feature</th><th scope="col">Coefficient</th><th scope="col">Value &minus; training average</th><th scope="col">Personal push</th></tr></thead><tbody>${numeric.map((f) => `<tr><th scope="row">${f.label}</th><td>${signed(b.linear.coefficients[f.name], 3)} ${u} per ${f.units}</td><td>${fmt(state.values[f.name], 3)} &minus; ${fmt(b.linear.reference[f.name], 3)} ${f.units}</td><td>${signed(ex.pushes[f.name])} ${u}</td></tr>`).join("")}</tbody></table></div>`;
}

// Horizontal waterfall: every contribution connects consecutive running totals.
function linearWaterfall(ex, entries, units) {
  let total = ex.baseline;
  const rows = [{ label: "Starting point", start: 0, end: total, value: total, kind: "total" }];
  for (const e of entries) {
    const start = total;
    total += e.push;
    rows.push({ ...e, start, end: total, value: e.push, kind: e.push >= 0 ? "up" : "down" });
  }
  rows.push({ label: "Final prediction", start: 0, end: ex.prediction, value: ex.prediction, kind: "total" });
  const lo = Math.min(0, ...rows.flatMap((r) => [r.start, r.end]));
  const hi = Math.max(0, ...rows.flatMap((r) => [r.start, r.end]));
  const span = hi - lo || 1;
  const x = (v) => 290 + ((v - lo) / span) * 410;
  const height = 65 + rows.length * 62;
  return `<svg class="linear-waterfall" viewBox="0 0 930 ${height}" role="img" aria-labelledby="waterfall-title waterfall-desc">
    <title id="waterfall-title">Prediction waterfall (${units})</title>
    <desc id="waterfall-desc">${rows.map((r) => `${r.label}: ${r.kind === "total" ? fmt(r.value) : signed(r.value)} ${units}`).join("; ")}. Starting point plus all pushes equals the final prediction.</desc>
    ${Array.from({ length: 5 }, (_, i) => {
      const v = lo + span * i / 4;
      return `<line x1="${x(v)}" x2="${x(v)}" y1="32" y2="${height - 20}" stroke="var(--line)"/><text x="${x(v)}" y="22" text-anchor="middle">${fmt(v)} ${units}</text>`;
    }).join("")}
    ${rows.map((r, i) => {
      const y = 48 + i * 62;
      const color = r.kind === "total" ? "var(--accent)" : `var(--${r.kind})`;
      return `<text x="8" y="${y + 12}">${r.label}</text>
        <rect x="${Math.min(x(r.start), x(r.end))}" y="${y}" width="${Math.max(1, Math.abs(x(r.end) - x(r.start)))}" height="24" fill="${color}" rx="3"/>
        ${i < rows.length - 1 ? `<line x1="${x(r.end)}" x2="${x(r.end)}" y1="${y + 24}" y2="${y + 62}" stroke="var(--muted)" stroke-dasharray="3 3"/>` : ""}
        <text x="720" y="${y + 16}" fill="${color}">${r.kind === "total" ? fmt(r.value) : `${r.kind === "up" ? "+ Up" : "- Down"} ${signed(r.value)}`} ${units}</text>`;
    }).join("")}
  </svg>`;
}

// ---- Wisdom of the Forest ----------------------------------------------------
// Keep the slider mounted: dragging updates results, not the input itself.
function renderForest(b, person) {
  const rf = b.forest;
  const trees = rf.people[person.id].tree_predictions;
  const averages = trees.map((_, i) => m10.runningAverage(trees, i + 1));
  const n = Math.max(1, Math.min(rf.n_trees, Number(state.nTrees || 10)));
  const uniquePercent = Math.round(100 * rf.bootstrap_unique_training_rows.reduce((a, c) => a + c, 0) / rf.bootstrap_unique_training_rows.length / rf.n_training_rows);
  $("section").innerHTML = `<article class="forest-section">
    <h2><span class="model-tag">02 / RANDOM FOREST</span>Wisdom of the Forest</h2>
    <p class="forest-intro">One tree offers one guess. A forest combines different trees by taking their average.</p>
    <p>${person.label} (${person.description}). Measured outcome: <strong>${fmt(person.observed)} ${b.units}</strong>. These predictions use the supplied person's original inputs.</p>
    <aside class="forest-callout">
      <strong>${person.id === "P4" ? "You are exploring Example person 4: a useful disagreement example." : "Try Example person 4 to explore tree disagreement."}</strong>
      <p>Different trees can give very different predictions for the same person. Compare the individual dots with the running-average line.</p>
      <button type="button" id="forest-review-example">Explore Glucose, Example person 4</button>
    </aside>
    <section class="forest-card" aria-labelledby="forest-chart-heading">
      <h3 id="forest-chart-heading">Watch the average take shape</h3>
      <label class="forest-slider-label" for="ntrees">Trees included: first <output id="ntrees-value" for="ntrees">${n}</output> of ${rf.n_trees}</label>
      <input id="ntrees" type="range" min="1" max="${rf.n_trees}" step="1" value="${n}" aria-describedby="forest-slider-help">
      <p id="forest-slider-help" class="note">Move the slider or use arrow keys. Trees enter in the supplied order. The chart scale stays fixed as N changes.</p>
      <p id="forest-summary" role="status" aria-live="polite"></p>
      <p class="chart-explanation">Each dot is one tree's prediction for this person. The running average combines the first N guesses; watch how much it moves as you include more trees.</p>
      <p class="forest-legend"><span class="forest-dot-key">&#9679;</span> Filled dots: included tree guesses. Hollow dots: excluded trees. <span class="forest-line-key">&#9473;&#9473;</span> Solid line and square: running average of trees 1 through N. Dashed line: full ${rf.n_trees}-tree prediction.</p>
      <div id="forest-chart" class="forest-scroll" tabindex="0" role="region" aria-label="Tree predictions chart; scroll horizontally on small screens"></div>
      <div id="forest-results"></div>
      <details><summary>Read all ${rf.n_trees} tree predictions and running averages</summary>
        <div class="forest-scroll" tabindex="0" role="region" aria-label="Tree prediction data table"><table>
          <caption>Predictions in supplied tree order (${b.units})</caption>
          <thead><tr><th scope="col">Tree</th><th scope="col">Individual guess (${b.units})</th><th scope="col">Average of first N (${b.units})</th><th scope="col">Included?</th></tr></thead>
          <tbody id="forest-tree-rows"></tbody>
        </table></div>
      </details>
    </section>
    <section class="forest-card">
      <h3>Why do the trees differ?</h3>
      <p><strong>Bootstrap sampling:</strong> each tree learns from a random sample of training rows drawn with replacement, so some people appear more than once. On average, these trees see about ${uniquePercent}% of the ${rf.n_training_rows} distinct training people.</p>
      <p><strong>Feature randomness:</strong> at each split, a tree considers only ${rf.features_tried_per_split} of the ${rf.n_features} input features. Different samples and candidate features lead to different questions and guesses.</p>
      <p><strong>Averaging:</strong> a high guess from one tree can be balanced by lower guesses from others. A single tree's quirks have less influence when its guess is one of ${rf.n_trees}. The trees are related, so averaging cannot remove every shared error or guarantee a more accurate prediction for every person.</p>
      <h3>Disagreement is not calibrated uncertainty</h3>
      <p>The lowest-to-highest tree guesses describe <strong>disagreement between these fitted trees</strong>. They are not a confidence interval or a prediction interval: they have no calibrated probability of containing this person's true outcome. The trees share training data and can agree while all being wrong.</p>
    </section>
    <aside class="forest-callout">
      <h3>Reviewer task</h3>
      <p>On <strong>Glucose, Example person 4</strong>, move from 1 to 100 trees. Explain why the combined average can be steadier than an individual tree. Compare the jumps between individual dots with changes in the running average.</p>
      <details><summary>Check your explanation</summary><p>Each new tree contributes just one of N guesses to the average. High and low guesses can offset each other, so the average can move less than individual tree guesses. It need not settle monotonically, and a steadier average does not prove accuracy or calibrated uncertainty.</p></details>
    </aside>
  </article>`;
  const update = (k) => {
    const average = m10.runningAverage(trees, k);
    const label = k < rf.n_trees ? "Partial forest" : "Full forest";
    $("ntrees-value").textContent = k;
    $("ntrees").setAttribute("aria-valuetext", `${k} trees; ${label}: ${fmt(average)} ${b.units}`);
    $("forest-summary").textContent = `${label}: average of the first ${k} of ${rf.n_trees} trees = ${fmt(average)} ${b.units}.`;
    $("forest-chart").innerHTML = forestChart(trees, averages, k, rf.people[person.id].prediction, b.units);
    $("forest-results").innerHTML = `<dl class="forest-metrics">
      <div><dt>Tree 1 alone</dt><dd>${fmt(trees[0])} ${b.units}</dd></div>
      <div><dt>Tree ${k} alone (latest included)</dt><dd>${fmt(trees[k - 1])} ${b.units}</dd></div>
      <div><dt>Full forest prediction (all ${rf.n_trees} trees)</dt><dd>${fmt(rf.people[person.id].prediction)} ${b.units}</dd></div>
      <div><dt>All-tree disagreement (lowest to highest guess)</dt><dd>${fmt(Math.min(...trees))} to ${fmt(Math.max(...trees))} ${b.units}</dd></div>
    </dl>`;
    $("forest-tree-rows").innerHTML = trees.map((v, i) => `<tr><th scope="row">${i + 1}</th><td>${fmt(v)} ${b.units}</td><td>${fmt(averages[i])} ${b.units}</td><td>${i < k ? "Included" : "Excluded"}</td></tr>`).join("");
  };
  $("ntrees").oninput = (e) => { state.nTrees = Number(e.target.value); update(state.nTrees); };
  $("forest-review-example").onclick = () => {
    state.key = "glucose";
    state.person = "P4";
    $("dataset").value = state.key;
    state.values = null;
    render();
  };
  update(n);
}

function forestChart(trees, averages, n, fullPrediction, units) {
  const W = 800, H = 370, left = 85, right = 25, top = 45, bottom = 55;
  const minimum = Math.min(...trees), maximum = Math.max(...trees);
  const margin = (maximum - minimum || Math.max(1, Math.abs(maximum))) * 0.08;
  const lo = minimum - margin, hi = maximum + margin;
  const x = (i) => left + i / (trees.length - 1) * (W - left - right);
  const y = (v) => H - bottom - (v - lo) / (hi - lo) * (H - top - bottom);
  const path = averages.slice(0, n).map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  return `<svg class="forest-chart" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="forest-svg-title forest-svg-desc">
    <title id="forest-svg-title">Individual tree guesses and running average (${units})</title>
    <desc id="forest-svg-desc">First ${n} trees included. Filled circles are included guesses; hollow circles are excluded. The solid line ends at their average, ${fmt(averages[n - 1])} ${units}. The dashed line is the full forest prediction, ${fmt(fullPrediction)} ${units}. Exact values are in the table below.</desc>
    <text x="${left}" y="20">Prediction (${units})</text>
    ${Array.from({ length: 5 }, (_, i) => {
      const v = lo + (hi - lo) * i / 4;
      return `<line x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${left - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
    }).join("")}
    <line x1="${left}" x2="${W - right}" y1="${y(fullPrediction)}" y2="${y(fullPrediction)}" stroke="var(--fg)" stroke-width="2" stroke-dasharray="7 5"/>
    ${trees.map((v, i) => `<circle class="forest-tree ${i < n ? "included" : "excluded"}" cx="${x(i)}" cy="${y(v)}" r="3.5" fill="${i < n ? "var(--up)" : "var(--bg)"}" stroke="${i < n ? "var(--up)" : "var(--muted)"}"><title>Tree ${i + 1}: ${fmt(v)} ${units}; ${i < n ? "included" : "excluded"}</title></circle>`).join("")}
    <path class="forest-average-line" d="${path}" fill="none" stroke="var(--accent)" stroke-width="3"/>
    <rect x="${x(n - 1) - 5}" y="${y(averages[n - 1]) - 5}" width="10" height="10" fill="var(--accent)" stroke="var(--bg)"><title>Average of first ${n}: ${fmt(averages[n - 1])} ${units}</title></rect>
    ${[1, 20, 40, 60, 80, trees.length].map((k) => `<text x="${x(k - 1)}" y="${H - bottom + 22}" text-anchor="middle">${k}</text>`).join("")}
    <text x="${(left + W - right) / 2}" y="${H - 8}" text-anchor="middle">Tree number (supplied order); running average uses trees 1 through N</text>
  </svg>`;
}

// ---- One Correction at a Time -----------------------------------------------
function renderBoosting(b, person) {
  const u = b.units;
  const gb = b.boosting;
  const p = gb.people[person.id];
  const last = p.corrections.length;
  // Each newly selected person/dataset begins with the training-average model.
  let round = 0;
  $("section").innerHTML = `<article class="boosting-section">
    <h2><span class="model-tag">03 / GRADIENT BOOSTING</span>One Correction at a Time</h2>
    <p class="boosting-intro">Start with the training average. Add one small tree correction per round. Use validation performance to decide when to stop.</p>
    <p>${person.label} (${person.description}). Measured outcome: <strong>${fmt(person.observed)} ${u}</strong>. Predictions use this supplied person's original inputs.</p>
    <section class="boosting-card" aria-labelledby="boosting-round-title">
      <h3 id="boosting-round-title">Build the prediction, one round at a time</h3>
      <p>Round 0 starting prediction: <strong>${fmt(gb.init)} ${u}</strong>, the average outcome in the training rows. No trees have been added yet.</p>
      <label for="round" class="boosting-round-label">Round / selected stopping round: <output id="round-value" for="round">0</output> of ${last}</label>
      <input id="round" type="range" min="0" max="${last}" step="1" value="0" aria-describedby="boosting-slider-help">
      <div class="boosting-buttons">
        <button id="round-prev" type="button">Previous round</button>
        <button id="round-next" type="button">Next round</button>
        <button id="round-start" type="button">Back to round 0</button>
        <button id="round-best" type="button">Choose best validation round (${gb.best_validation_round})</button>
      </div>
      <p id="boosting-slider-help" class="note">Drag the slider, use arrow keys, or step with the buttons. The selected round is also your stopping-round choice.</p>
      <p id="boosting-status" role="status" aria-live="polite"></p>
      <div id="boosting-results"></div>
      <p class="note">The supplied corrections already include the learning rate. They are added exactly once. Displayed values are rounded; predictions use the supplied full-precision sequence.</p>
    </section>
    <section class="boosting-card" aria-labelledby="boosting-stop-title">
      <h3 id="boosting-stop-title">When should training stop?</h3>
      <p><strong>RMSE</strong> (root mean squared error) summarizes prediction errors across people in the outcome's units; lower is better. These curves describe the dataset, not just the selected person.</p>
      <p class="boosting-legend"><span class="boosting-training-key">- -</span> Dashed line: training RMSE. <span class="boosting-validation-key">&#9473;&#9473;</span> Solid line: validation RMSE. Vertical dotted line: selected stopping round. Square: lowest validation RMSE.</p>
      <p class="chart-explanation">Trees learn the training residuals (observed minus predicted outcomes). Watch whether validation error still improves as training error falls; the lowest validation point guides the stopping choice.</p>
      <div id="boosting-chart" class="boosting-scroll" tabindex="0" role="region" aria-label="RMSE chart; scroll horizontally on small screens"></div>
      <div id="boosting-comparison"></div>
    </section>
    <section class="boosting-card">
      <h3>What is each new tree learning?</h3>
      <p>A <strong>training residual</strong> is an observed training outcome minus the current prediction. Each new tree is fitted to those training residuals, so it learns a correction to the model so far. The learning rate makes each correction small. A correction can be positive or negative, and need not improve every person's prediction at every round.</p>
      <h3>Why watch validation performance?</h3>
      <p>Training error can keep falling as trees learn details specific to the training rows. If validation error rises while training error falls, the model may be <strong>overfitting</strong>: fitting training-specific patterns that do not generalize to held-out people.</p>
      <p>The lowest validation RMSE gives a <strong>validation-based stopping choice</strong> among the supplied rounds. Because validation data are used to choose the round, this error is not an independent test result. The best round is shared by all example people in a dataset.</p>
    </section>
  </article>`;
  const update = (k) => {
    round = Math.max(0, Math.min(last, k));
    $("round").value = round;
    $("round-value").textContent = round;
    $("round-prev").disabled = round === 0;
    $("round-next").disabled = round === last;
    $("round-start").disabled = round === 0;
    $("round").setAttribute("aria-valuetext", `Round ${round}; prediction ${fmt(p.staged[round])} ${u}`);
    $("boosting-status").textContent = `Round ${round}: prediction ${fmt(p.staged[round])} ${u}; validation RMSE ${fmt(gb.rmse.validation[round])} ${u}.`;
    $("boosting-results").innerHTML = round === 0
      ? `<div class="boosting-start"><h4>Round 0: training-average starting prediction</h4><p class="boosting-number">${fmt(gb.init)} ${u}</p><p>No previous prediction or tree correction exists at round 0.</p></div>`
      : `<div class="boosting-equation">
          <div><h4>Prediction after round ${round - 1}</h4><p id="boosting-previous" class="boosting-number">${fmt(p.staged[round - 1])} ${u}</p></div>
          <div><h4>Add tree ${round}'s correction</h4><p id="boosting-correction" class="boosting-number ${p.corrections[round - 1] >= 0 ? "up" : "down"}">${signed(p.corrections[round - 1], 2)} ${u}</p><p>${p.corrections[round - 1] >= 0 ? "Positive: adds to" : "Negative: subtracts from"} the previous prediction.</p></div>
          <div><h4>Equals prediction after round ${round}</h4><p id="boosting-updated" class="boosting-number">${fmt(p.staged[round])} ${u}</p></div>
        </div>`;
    $("boosting-chart").innerHTML = rmseChart(gb, round, u);
    const difference = gb.rmse.validation[round] - gb.best_validation_rmse;
    $("boosting-comparison").innerHTML = `<dl class="boosting-metrics">
      <div><dt>Your stopping round</dt><dd>${round}</dd></div>
      <div><dt>Validation RMSE at round ${round}</dt><dd>${fmt(gb.rmse.validation[round])} ${u}</dd></div>
      <div><dt>Training RMSE at round ${round}</dt><dd>${fmt(gb.rmse.train[round])} ${u}</dd></div>
      <div><dt>Best validation round</dt><dd>${gb.best_validation_round}</dd></div>
      <div><dt>Minimum validation RMSE</dt><dd>${fmt(gb.best_validation_rmse)} ${u}</dd></div>
      <div><dt>Validation RMSE above minimum</dt><dd>${fmt(difference, 2)} ${u}</dd></div>
    </dl><p>${round === gb.best_validation_round ? "You selected the validation-based best round." : `Your choice is ${round < gb.best_validation_round ? "before" : "after"} the validation-based best round. Compare both curves, rather than choosing by training error alone.`}</p>`;
  };
  $("round").oninput = (e) => update(Number(e.target.value));
  $("round-prev").onclick = () => update(round - 1);
  $("round-next").onclick = () => update(round + 1);
  $("round-start").onclick = () => update(0);
  $("round-best").onclick = () => update(gb.best_validation_round);
  update(0);
}

function rmseChart(gb, round, u) {
  const W = 800, H = 370, left = 95, right = 25, top = 25, bottom = 60;
  const tr = gb.rmse.train, va = gb.rmse.validation;
  const minimum = Math.min(...tr, ...va), maximum = Math.max(...tr, ...va);
  const margin = (maximum - minimum || 1) * 0.06;
  const lo = Math.max(0, minimum - margin), hi = maximum + margin;
  const x = (i) => left + i / (tr.length - 1) * (W - left - right);
  const y = (v) => H - bottom - (v - lo) / (hi - lo) * (H - top - bottom);
  const line = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  return `<svg class="boosting-chart" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="boosting-svg-title boosting-svg-desc">
    <title id="boosting-svg-title">Training and validation RMSE by boosting round (${u})</title>
    <desc id="boosting-svg-desc">Dashed training curve and solid validation curve. Selected round ${round}: training RMSE ${fmt(tr[round])} ${u}, validation RMSE ${fmt(va[round])} ${u}. Square marks the minimum validation RMSE, ${fmt(gb.best_validation_rmse)} ${u} at round ${gb.best_validation_round}.</desc>
    ${Array.from({ length: 5 }, (_, i) => {
      const v = lo + (hi - lo) * i / 4;
      return `<line x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${left - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
    }).join("")}
    <path class="boosting-training-curve" d="${line(tr)}" fill="none" stroke="var(--muted)" stroke-width="2.5" stroke-dasharray="6 4"/>
    <path class="boosting-validation-curve" d="${line(va)}" fill="none" stroke="var(--accent)" stroke-width="3"/>
    <line x1="${x(round)}" x2="${x(round)}" y1="${top}" y2="${H - bottom}" stroke="var(--fg)" stroke-dasharray="2 4"/>
    <circle cx="${x(round)}" cy="${y(tr[round])}" r="4" fill="var(--muted)"/>
    <circle cx="${x(round)}" cy="${y(va[round])}" r="4" fill="var(--accent)"/>
    <rect x="${x(gb.best_validation_round) - 5}" y="${y(gb.best_validation_rmse) - 5}" width="10" height="10" fill="var(--accent)" stroke="var(--fg)"><title>Best validation round ${gb.best_validation_round}: ${fmt(gb.best_validation_rmse)} ${u}</title></rect>
    ${[0,100,200,300,400,tr.length - 1].map((k) => `<text x="${x(k)}" y="${H - bottom + 24}" text-anchor="middle">${k}</text>`).join("")}
    <text x="${(left + W - right) / 2}" y="${H - 10}" text-anchor="middle">Boosting round (0 = training-average starting model)</text>
    <text transform="translate(20 ${(top + H - bottom) / 2}) rotate(-90)" text-anchor="middle">RMSE (${u}); lower is better</text>
  </svg>`;
}

setup();
