/* ---------- state ---------- */
let CONFIG = {
  webAppUrl:
    "https://script.google.com/macros/s/AKfycbwo-UgC3rI0qgcr5FPtZELQS-7DW4NFwf-au9nNYv_oji2xk8wct1yS_79nx9Auv2NP/exec",
};
let PROJECTS = {}; // name -> {status, gauge, targetLength, yarnColor, yarnColorName, needleSize, method, technique, cityCountry}
let LOGS = []; // entries from sheet / local cache
let ACTIVE = null; // active session object or null
let VIEW_PROJECT = "";
let fMethod = "knit";
let liveTimerInterval = null;
const SCARF_COLS = 22;
const SCARF_ROWS = 20;

/* ---------- city autocomplete ---------- */
(() => {
  const input = document.getElementById("fCityCountry");
  const list = document.getElementById("cityAutocomplete");
  let activeIndex = -1;

  function closeList() {
    list.innerHTML = "";
    list.style.display = "none";
    activeIndex = -1;
  }

  function renderMatches() {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      closeList();
      return;
    }
    const matches = WORLD_CITIES.filter((c) => c.toLowerCase().startsWith(q)).slice(0, 8);
    if (!matches.length) {
      closeList();
      return;
    }
    list.innerHTML = matches
      .map((c, i) => `<div class="autocomplete-item" data-i="${i}">${c}</div>`)
      .join("");
    list.style.display = "block";
    activeIndex = -1;
  }

  input.addEventListener("input", renderMatches);
  input.addEventListener("focus", renderMatches);

  list.addEventListener("mousedown", (e) => {
    const item = e.target.closest(".autocomplete-item");
    if (!item) return;
    input.value = item.textContent;
    closeList();
  });

  input.addEventListener("keydown", (e) => {
    const items = [...list.querySelectorAll(".autocomplete-item")];
    if (!items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
    } else if (e.key === "Enter") {
      if (activeIndex >= 0) {
        e.preventDefault();
        input.value = items[activeIndex].textContent;
        closeList();
      }
      return;
    } else if (e.key === "Escape") {
      closeList();
      return;
    } else {
      return;
    }
    items.forEach((it, i) => it.classList.toggle("active", i === activeIndex));
  });

  document.addEventListener("click", (e) => {
    if (e.target !== input && !list.contains(e.target)) closeList();
  });
})();

/* ---------- color helpers ---------- */
function hexToHsl(hex) {
  hex = hex || "#A6503A";
  const r = parseInt(hex.slice(1, 3), 16) / 255,
    g = parseInt(hex.slice(3, 5), 16) / 255,
    b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h,
    s,
    l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}
function randomShade(hex) {
  const [h, s, l] = hexToHsl(hex);
  const jitterH = (h + (Math.random() * 60 - 30) + 360) % 360;
  const jitterS = Math.max(0, Math.min(100, s + (Math.random() * 10 - 5)));
  const jitterL = Math.max(25, Math.min(75, l + (Math.random() * 10 - 5)));
  return `hsl(${jitterH.toFixed(0)} ${jitterS.toFixed(0)}% ${jitterL.toFixed(0)}%)`;
}

function fmtAt(d) {
  const time = d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: false });
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  return `${time}, ${date}`;
}
document.getElementById("todayLabel").textContent = fmtAt(new Date());

/* ---------- storage ---------- */
function loadAll() {
  try {
    PROJECTS = JSON.parse(localStorage.getItem("knitlog_projects")) || {};
  } catch (e) {
    PROJECTS = {};
  }
  try {
    LOGS = JSON.parse(localStorage.getItem("knitlog_logs_cache")) || [];
  } catch (e) {
    LOGS = [];
  }
  try {
    ACTIVE = JSON.parse(localStorage.getItem("knitlog_active_session")) || null;
  } catch (e) {
    ACTIVE = null;
  }
  VIEW_PROJECT = localStorage.getItem("knitlog_view_project") || "";
}
function persistProjects() {
  localStorage.setItem("knitlog_projects", JSON.stringify(PROJECTS));
}
function persistLogsCache() {
  localStorage.setItem("knitlog_logs_cache", JSON.stringify(LOGS));
}
function persistActive() {
  if (ACTIVE) localStorage.setItem("knitlog_active_session", JSON.stringify(ACTIVE));
  else localStorage.removeItem("knitlog_active_session");
}
function persistViewProject() {
  localStorage.setItem("knitlog_view_project", VIEW_PROJECT);
}

/* ---------- config ---------- */
function fetchLogs() {
  if (!CONFIG.webAppUrl) {
    renderAll();
    return;
  }
  fetch(CONFIG.webAppUrl + "?action=list")
    .then((r) => r.json())
    .then((data) => {
      if (Array.isArray(data.entries)) {
        LOGS = data.entries;
        persistLogsCache();
      }
      renderAll();
    })
    .catch((err) => {
      console.error("Load failed:", err.message);
      renderAll();
    });
}
function setStatus(id, msg, isErr) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = "status " + (isErr ? "err" : "ok");
}

/* ---------- start form ---------- */
function openStartForm() {
  document.getElementById("startForm").style.display = "block";
  populateProjectSelect();
}
function closeStartForm() {
  document.getElementById("startForm").style.display = "none";
  clearStartFields();
}
function populateProjectSelect() {
  const sel = document.getElementById("projectSelect");
  sel.innerHTML = '<option value="">— choose an in-progress project —</option>';
  Object.keys(PROJECTS).forEach((name) => {
    if (PROJECTS[name].status !== "completed") {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    }
  });
}
function onProjectPick() {
  const name = document.getElementById("projectSelect").value;
  if (!name) return;
  document.getElementById("newProjectName").value = "";
  const p = PROJECTS[name];
  document.getElementById("fGauge").value = p.gauge || "";
  document.getElementById("fTargetLength").value = p.targetLength || "";
  document.getElementById("fYarnColor").value = p.yarnColor || "#A6503A";
  document.getElementById("fYarnColorName").value = p.yarnColorName || "";
  document.getElementById("fNeedleSize").value = p.needleSize || "";
  document.getElementById("fCityCountry").value = p.cityCountry || "";
  setFMethod(p.method || "knit");
  document.querySelectorAll('#fTechChips input[type="checkbox"]').forEach((c) => {
    c.checked = (p.technique || "").includes(c.value);
  });
}
function onNewProjectTyped() {
  if (document.getElementById("newProjectName").value.trim()) {
    document.getElementById("projectSelect").value = "";
  }
}
function setFMethod(m) {
  fMethod = m;
  document.getElementById("fMethodKnit").checked = m === "knit";
  document.getElementById("fMethodCrochet").checked = m === "crochet";
}
function clearStartFields() {
  [
    "fStartLength",
    "fGauge",
    "fTargetLength",
    "fNeedleSize",
    "fYarnColorName",
    "fCityCountry",
    "newProjectName",
  ].forEach((id) => (document.getElementById(id).value = ""));
  document.getElementById("projectSelect").value = "";
  document
    .querySelectorAll('#fTechChips input[type="checkbox"]')
    .forEach((c) => (c.checked = false));
  setFMethod("knit");
  document.getElementById("startStatus").textContent = "";
}

function startTimer() {
  const picked = document.getElementById("projectSelect").value;
  const typed = document.getElementById("newProjectName").value.trim();
  const project = typed || picked;
  const startLength = parseFloat(document.getElementById("fStartLength").value);
  if (!project) {
    setStatus("startStatus", "Enter or choose a project name.", true);
    return;
  }
  if (isNaN(startLength)) {
    setStatus("startStatus", "Enter a start length.", true);
    return;
  }

  const techChips = [
    ...document.querySelectorAll('#fTechChips input[type="checkbox"]:checked'),
  ].map((c) => c.value);
  const customTech = document.getElementById("fTechCustom").value.trim();
  if (customTech)
    techChips.push(
      ...customTech
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    );
  const technique = techChips.join(", ");

  const projectData = {
    status: "in_progress",
    gauge: document.getElementById("fGauge").value || "",
    targetLength: document.getElementById("fTargetLength").value || "",
    yarnColor: document.getElementById("fYarnColor").value,
    yarnColorName: document.getElementById("fYarnColorName").value || "",
    needleSize: document.getElementById("fNeedleSize").value || "",
    method: fMethod,
    technique: technique,
    cityCountry: document.getElementById("fCityCountry").value || "",
  };
  PROJECTS[project] = Object.assign(PROJECTS[project] || {}, projectData);
  persistProjects();

  ACTIVE = Object.assign({ project, startLength, startTimestamp: Date.now() }, projectData);
  persistActive();

  VIEW_PROJECT = project;
  persistViewProject();

  document.getElementById("startForm").style.display = "none";
  clearStartFields();
  renderAll();
}

/* ---------- active session / timer ---------- */
function fmtHMS(sec) {
  const h = Math.floor(sec / 3600)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((sec % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return h + ":" + m + ":" + s;
}
function tickTimer() {
  if (!ACTIVE) return;
  const elapsed = Math.floor((Date.now() - ACTIVE.startTimestamp) / 1000);
  const el = document.getElementById("liveTimer");
  if (el) el.textContent = fmtHMS(elapsed);
}
function renderActiveSession() {
  const btnWrap = document.getElementById("startButtonWrap");
  const mainTopline = document.getElementById("mainTopline");
  const card = document.getElementById("activeSessionCard");
  if (!ACTIVE) {
    card.style.display = "none";
    btnWrap.style.display = "inline-block";
    mainTopline.style.display = "flex";
    if (liveTimerInterval) {
      clearInterval(liveTimerInterval);
      liveTimerInterval = null;
    }
    return;
  }
  btnWrap.style.display = "none";
  mainTopline.style.display = "none";
  document.getElementById("startForm").style.display = "none";
  card.style.display = "block";
  document.getElementById("activeProjectName").textContent = ACTIVE.project;
  document.getElementById("activeAtLabel").textContent = fmtAt(new Date(ACTIVE.startTimestamp));
  document.getElementById("activeMeta").textContent = [
    ACTIVE.cityCountry,
    ACTIVE.method === "crochet" ? "Crochet" : "Knit",
    ACTIVE.needleSize,
  ]
    .filter(Boolean)
    .join(" · ");
  tickTimer();
  if (!liveTimerInterval) liveTimerInterval = setInterval(tickTimer, 1000);
}
function cancelSession() {
  ACTIVE = null;
  persistActive();
  document.getElementById("finishForm").style.display = "none";
  renderAll();
}
function openFinishForm() {
  document.getElementById("finishForm").style.display = "block";
  document.getElementById("finStartLength").value = ACTIVE.startLength;
  document.getElementById("finEndLength").value = "";
  document.getElementById("finLengthToday").value = "";
  document.getElementById("finRemaining").value = "";
  const elapsed = Math.floor((Date.now() - ACTIVE.startTimestamp) / 1000);
  document.getElementById("finDuration").value = Math.round(elapsed / 60);
}
function closeFinishForm() {
  document.getElementById("finishForm").style.display = "none";
}
function finishRecalc() {
  const s = ACTIVE.startLength;
  const en = parseFloat(document.getElementById("finEndLength").value);
  const t = parseFloat(ACTIVE.targetLength);
  document.getElementById("finLengthToday").value = !isNaN(en) ? (en - s).toFixed(1) : "";
  document.getElementById("finRemaining").value =
    !isNaN(en) && !isNaN(t) ? Math.max(t - en, 0).toFixed(1) : "";
}

function saveLog() {
  const en = parseFloat(document.getElementById("finEndLength").value);
  if (isNaN(en)) {
    setStatus("finishStatus", "Enter the end length.", true);
    return;
  }
  const entry = {
    timestamp: new Date().toISOString(),
    project: ACTIVE.project,
    startLength: ACTIVE.startLength,
    endLength: en,
    lengthToday: +(en - ACTIVE.startLength).toFixed(2),
    gauge: ACTIVE.gauge,
    targetLength: ACTIVE.targetLength,
    remainingLength: document.getElementById("finRemaining").value || "",
    durationMin: document.getElementById("finDuration").value || "",
    yarnColor: ACTIVE.yarnColor,
    yarnColorName: ACTIVE.yarnColorName,
    needleSize: ACTIVE.needleSize,
    method: ACTIVE.method,
    technique: ACTIVE.technique,
    cityCountry: ACTIVE.cityCountry,
  };
  LOGS.push(entry);
  persistLogsCache();
  VIEW_PROJECT = entry.project;
  persistViewProject();

  ACTIVE = null;
  persistActive();
  document.getElementById("finishForm").style.display = "none";
  renderAll();
  setStatus("finishStatus", "Saved.", false);

  if (!CONFIG.webAppUrl) return;
  fetch(CONFIG.webAppUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "append", entry }),
  }).catch(() => {});
}

/* ---------- progress panel ---------- */
function populateViewProjectSelect() {
  const sel = document.getElementById("viewProjectSelect");
  const names = new Set(Object.keys(PROJECTS));
  LOGS.forEach((l) => names.add(l.project));
  if (sel) sel.innerHTML = "";
  if (names.size === 0) {
    if (sel) sel.innerHTML = '<option value="">No projects yet</option>';
    return;
  }
  [...names].forEach((n) => {
    if (!sel) return;
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n + (PROJECTS[n] && PROJECTS[n].status === "completed" ? " (done)" : "");
    sel.appendChild(opt);
  });
  if (!VIEW_PROJECT || !names.has(VIEW_PROJECT)) VIEW_PROJECT = [...names][0];
  if (sel) sel.value = VIEW_PROJECT;
}
function onViewProjectChange() {
  const sel = document.getElementById("viewProjectSelect");
  if (!sel) return;
  VIEW_PROJECT = sel.value;
  persistViewProject();
  renderScarf();
}
function toggleProjectComplete() {
  if (!VIEW_PROJECT || !PROJECTS[VIEW_PROJECT]) return;
  const p = PROJECTS[VIEW_PROJECT];
  p.status = p.status === "completed" ? "in_progress" : "completed";
  persistProjects();
  renderScarf();
  populateProjectSelect();
}
function renderScarf() {
  const col = document.getElementById("scarfCol");
  col.innerHTML = "";

  const entries = LOGS.filter((l) => l.project === VIEW_PROJECT).sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
  );
  const proj = PROJECTS[VIEW_PROJECT];
  const lastEntry = entries[entries.length - 1];
  const target =
    (proj && parseFloat(proj.targetLength)) ||
    (lastEntry && parseFloat(lastEntry.targetLength)) ||
    0;
  const cols = SCARF_COLS;

  const baseline = entries.length ? Math.max(parseFloat(entries[0].startLength) || 0, 0) : 0;
  const fallbackColor = (entries[0] && entries[0].yarnColor) || "#A6503A";

  let cumulative = baseline;
  const segments = [];
  if (baseline > 0) segments.push({ end: baseline, color: fallbackColor });
  entries.forEach((e) => {
    const cm = Math.max(parseFloat(e.lengthToday) || 0, 0);
    cumulative += cm;
    segments.push({ end: cumulative, color: e.yarnColor || "#A6503A" });
  });

  const denom = target > 0 ? target : cumulative;
  const pct = denom > 0 ? Math.min(cumulative / denom, 1) : 0;

  // square cells: derive the row count from the field's actual pixel size
  // so cellSize (width/cols) always divides the height evenly too.
  const fieldW = col.clientWidth || 1;
  const fieldH = col.clientHeight || 1;
  const colGap = 1,
    rowGap = 1;
  const cellSize = (fieldW - colGap * (cols - 1)) / cols;
  const rows = Math.max(1, Math.floor((fieldH + rowGap) / (cellSize + rowGap)) - 1);
  const filledRows = Math.ceil(pct * rows);

  function colorAt(cmPos) {
    for (const seg of segments) {
      if (cmPos <= seg.end) return seg.color;
    }
    return segments.length ? segments[segments.length - 1].color : fallbackColor;
  }

  for (let i = 0; i < rows; i++) {
    const rowEl = document.createElement("div");
    rowEl.className = "stitch-row";
    rowEl.style.height = cellSize + "px";
    const knitted = i < filledRows;
    const cmPos = ((i + 0.5) / rows) * denom;
    const rowColor = knitted ? colorAt(cmPos) : null;
    for (let c = 0; c < cols; c++) {
      const st = document.createElement("div");
      st.className = "stitch" + (knitted ? "" : " stitch-empty");
      if (knitted) st.style.background = randomShade(rowColor);
      rowEl.appendChild(st);
    }
    col.appendChild(rowEl);
  }

  const scarfCurrent = document.getElementById("scarfCurrent");
  const scarfTarget = document.getElementById("scarfTarget");
  if (scarfCurrent) scarfCurrent.textContent = cumulative.toFixed(1);
  if (scarfTarget) scarfTarget.textContent = target || "–";

  const completeBtn = document.getElementById("toggleCompleteBtn");
  if (completeBtn) {
    if (proj) {
      completeBtn.style.display = "block";
      completeBtn.textContent = proj.status === "completed" ? "Undo" : "Done";
    } else {
      completeBtn.style.display = "none";
    }
  }
}
window.addEventListener("resize", () => {
  if (document.getElementById("scarfCol")) renderScarf();
});

/* ---------- table ---------- */
let SORT_KEY = "timestamp";
let SORT_DIR = -1; // -1 = descending, 1 = ascending

function onSortClick(key) {
  if (SORT_KEY === key) {
    SORT_DIR *= -1;
  } else {
    SORT_KEY = key;
    SORT_DIR = 1;
  }
  renderTable();
}

function updateSortIndicators() {
  document.querySelectorAll("thead th[data-key]").forEach((th) => {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.dataset.key === SORT_KEY) {
      th.classList.add(SORT_DIR === 1 ? "sort-asc" : "sort-desc");
    }
  });
}

function renderTable() {
  const body = document.getElementById("logTableBody");
  body.innerHTML = "";
  updateSortIndicators();
  const numericKeys = new Set([
    "startLength",
    "endLength",
    "lengthToday",
    "gauge",
    "targetLength",
    "remainingLength",
    "durationMin",
  ]);
  const entries = [...LOGS].sort((a, b) => {
    let av = a[SORT_KEY];
    let bv = b[SORT_KEY];
    if (SORT_KEY === "timestamp") {
      av = new Date(av);
      bv = new Date(bv);
    } else if (numericKeys.has(SORT_KEY)) {
      av = parseFloat(av) || 0;
      bv = parseFloat(bv) || 0;
    } else {
      av = (av || "").toString().toLowerCase();
      bv = (bv || "").toString().toLowerCase();
    }
    if (av < bv) return -1 * SORT_DIR;
    if (av > bv) return 1 * SORT_DIR;
    return 0;
  });
  document.getElementById("emptyState").style.display = entries.length ? "none" : "block";
  entries.forEach((e) => {
    const tr = document.createElement("tr");
    const dt = new Date(e.timestamp);
    const done = PROJECTS[e.project] && PROJECTS[e.project].status === "completed";
    tr.innerHTML = `
      <td class="col-timestamp">${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}</td>
      <td class="col-project"><span class="project-tag ${done ? "done" : ""}">${e.project}</span></td>
      <td class="col-start">${e.startLength}</td>
      <td class="col-end">${e.endLength}</td>
      <td class="col-today">${e.lengthToday}</td>
      <td class="col-gauge">${e.gauge || "-"}</td>
      <td class="col-target">${e.targetLength || "-"}</td>
      <td class="col-remain">${e.remainingLength || "-"}</td>
      <td class="col-duration">${e.durationMin ? e.durationMin + " min" : "-"}</td>
      <td class="col-yarn"><span class="yarn-cell"><span class="swatch" style="background:${e.yarnColor || "#ccc"}"></span>${e.yarnColorName || ""}</span></td>
      <td class="col-needle">${e.needleSize || "-"}</td>
      <td class="col-method">${e.method === "crochet" ? "Crochet" : "Knit"}</td>
      <td class="col-technique">${e.technique || "-"}</td>
      <td class="col-location">${e.cityCountry || "-"}</td>
    `;
    body.appendChild(tr);
  });
}

/* ---------- render orchestration ---------- */
function renderAll() {
  renderActiveSession();
  populateViewProjectSelect();
  renderScarf();
  renderTable();
}

/* keep timer accurate even after the tab/app was backgrounded */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") tickTimer();
});
window.addEventListener("focus", tickTimer);

/* ---------- init ---------- */
loadAll();
renderAll();
if (CONFIG.webAppUrl) fetchLogs();
