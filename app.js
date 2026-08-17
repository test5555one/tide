/* =========================================================================
   Tidenkalender – App-Logik
   Datenquelle: BSH WaterLevelForecast API (OGC API Features)
   https://gdi.bsh.de/ldproxy/rest/services/WaterLevelForecast
   ========================================================================= */

const API_ITEMS_URL =
  "https://gdi.bsh.de/ldproxy/rest/services/WaterLevelForecast/collections/waterlevelforecastdata/items?f=json&limit=1000";

const REGION_LABELS = {
  north_sea: "Nordsee",
  baltic_sea: "Ostsee",
};

const state = {
  stations: [],       // alle geladenen Pegel (roh)
  filteredStations: [],
  selectedStation: null,
};

// ---------------------------------------------------------------------
// Utilities: Zeit
// ---------------------------------------------------------------------

/**
 * Parst einen BSH-Zeitstempel im Format "YYYY-MM-DD HH:mm:ss+HH:MM"
 * und liefert sowohl die Ortszeit (so wie geliefert) als auch UTC.
 */
function parseBshTimestamp(raw) {
  const m = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})([+-]\d{2}):?(\d{2})$/
  );
  if (!m) return null;

  const [, y, mo, d, h, mi, s, offH, offM] = m;
  const offsetMinutes =
    (offH.startsWith("-") ? -1 : 1) * (Math.abs(parseInt(offH, 10)) * 60 + parseInt(offM, 10));

  // UTC-Millis berechnen: lokale Zeit minus Offset
  const localAsUTCms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  const utcMs = localAsUTCms - offsetMinutes * 60000;
  const utcDate = new Date(utcMs);

  return {
    dateStr: `${d}.${mo}.${y}`,
    localTimeStr: `${h}:${mi}`,
    utcTimeStr: utcDate.toISOString().substr(11, 5),
    utcDate,
    // Für Vergleiche / Mondphase verwenden wir die tatsächliche UTC-Zeit
    jsDate: utcDate,
    year: +y,
    month: +mo,
    day: +d,
  };
}

// ---------------------------------------------------------------------
// Mondphase (astronomische Näherung, kein Internetzugriff nötig)
// ---------------------------------------------------------------------

const SYNODIC_MONTH = 29.530588853; // Tage
const KNOWN_NEW_MOON_UTC = Date.UTC(2000, 0, 6, 18, 14, 0); // 06.01.2000, 18:14 UTC

function moonPhase(date) {
  const diffDays = (date.getTime() - KNOWN_NEW_MOON_UTC) / 86400000;
  let phase = (diffDays % SYNODIC_MONTH) / SYNODIC_MONTH;
  if (phase < 0) phase += 1;
  return phase; // 0 = Neumond, 0.25 = zunehmender Halbmond, 0.5 = Vollmond, 0.75 = abnehmender Halbmond
}

function moonEmoji(phase) {
  const emojis = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
  const idx = Math.round(phase * 8) % 8;
  return emojis[idx];
}

function moonLabel(phase) {
  const labels = [
    "Neumond", "zunehmende Sichel", "zunehmender Halbmond", "zunehmender Dreiviertelmond",
    "Vollmond", "abnehmender Dreiviertelmond", "abnehmender Halbmond", "abnehmende Sichel",
  ];
  const idx = Math.round(phase * 8) % 8;
  return labels[idx];
}

/**
 * Leitet die Tidenart aus dem Abstand zur nächsten Syzygie (Neu-/Vollmond)
 * bzw. Quadratur (Halbmond) ab. Springtiden treten ca. 1–2 Tage nach
 * Neu-/Vollmond auf, Nipptiden ca. 1–2 Tage nach den Halbmond-Phasen.
 */
function tideType(phase) {
  const daysIntoCycle = phase * SYNODIC_MONTH;
  const distToNew = Math.min(daysIntoCycle, SYNODIC_MONTH - daysIntoCycle);
  const distToFull = Math.abs(daysIntoCycle - SYNODIC_MONTH / 2);
  const distToSyzygy = Math.min(distToNew, distToFull);

  const distToFirstQuarter = Math.abs(daysIntoCycle - SYNODIC_MONTH * 0.25);
  const distToLastQuarter = Math.abs(daysIntoCycle - SYNODIC_MONTH * 0.75);
  const distToQuadrature = Math.min(distToFirstQuarter, distToLastQuarter);

  if (distToSyzygy <= 2.2) return { key: "spring", label: "Springtide" };
  if (distToQuadrature <= 2.2) return { key: "nipp", label: "Nipptide" };
  return { key: "mittel", label: "Mitteltide" };
}

// ---------------------------------------------------------------------
// Daten laden
// ---------------------------------------------------------------------

async function loadStations() {
  const res = await fetch(API_ITEMS_URL, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`API antwortete mit Status ${res.status}`);
  const data = await res.json();

  return data.features.map((f) => {
    const p = f.properties;
    return {
      id: f.id,
      name: p.gauge_label,
      area: p.area,
      region: p.region,
      state: p.state,
      lat: p.latitude,
      lon: p.longitude,
      meanHigh: p.mean_high_water,
      meanLow: p.mean_low_water,
      forecastText: p.forecast_text && p.forecast_text.de,
      forecastTimestamp: p.forecast_timestamp,
      bshUrl: p.bsh_url_waterlevel,
      events: p.high_water_low_water || [],
      curve: p.curve || [],
    };
  });
}

// ---------------------------------------------------------------------
// UI: Filter aufbauen
// ---------------------------------------------------------------------

function populateStateFilter(stations) {
  const stateSelect = document.getElementById("stateSelect");
  const states = [...new Set(stations.map((s) => s.state).filter(Boolean))].sort();
  states.forEach((st) => {
    const opt = document.createElement("option");
    opt.value = st;
    opt.textContent = st;
    stateSelect.appendChild(opt);
  });
}

function applyFilters() {
  const region = document.getElementById("regionSelect").value;
  const bundesland = document.getElementById("stateSelect").value;

  state.filteredStations = state.stations.filter((s) => {
    if (region && s.region !== region) return false;
    if (bundesland && s.state !== bundesland) return false;
    return true;
  });

  document.getElementById("stationCount").textContent =
    `${state.filteredStations.length} von ${state.stations.length} Pegeln entsprechen der Auswahl`;

  const searchVal = document.getElementById("stationSearch").value.trim();
  if (searchVal.length > 0) {
    renderStationDropdown(searchVal);
  }
}

// ---------------------------------------------------------------------
// UI: Such-Dropdown
// ---------------------------------------------------------------------

function renderStationDropdown(query) {
  const dropdown = document.getElementById("stationDropdown");
  const q = query.toLowerCase();

  const matches = state.filteredStations
    .filter((s) => s.name.toLowerCase().includes(q) || (s.area || "").toLowerCase().includes(q))
    .slice(0, 40);

  if (matches.length === 0) {
    dropdown.innerHTML = `<div class="station-option">Keine Treffer</div>`;
    dropdown.hidden = false;
    return;
  }

  dropdown.innerHTML = matches
    .map(
      (s) => `
      <div class="station-option" data-id="${s.id}">
        <span>${s.name}</span>
        <small>${REGION_LABELS[s.region] || ""}${s.state ? " · " + s.state : ""}</small>
      </div>`
    )
    .join("");
  dropdown.hidden = false;

  dropdown.querySelectorAll(".station-option[data-id]").forEach((el) => {
    el.addEventListener("click", () => {
      const st = state.stations.find((s) => s.id === el.dataset.id);
      selectStation(st);
      dropdown.hidden = true;
      document.getElementById("stationSearch").value = st.name;
    });
  });
}

// ---------------------------------------------------------------------
// UI: Station anzeigen
// ---------------------------------------------------------------------

function selectStation(station) {
  state.selectedStation = station;
  document.getElementById("emptyState").hidden = true;
  document.getElementById("stateMessage").hidden = true;
  const view = document.getElementById("stationView");
  view.hidden = false;

  document.getElementById("stationName").textContent = station.name;
  document.getElementById("stationSub").textContent =
    `${station.area || ""}${station.area ? " · " : ""}${station.state || ""}`;
  document.getElementById("badgeRegion").textContent = REGION_LABELS[station.region] || "—";
  document.getElementById("badgeMHW").textContent =
    station.meanHigh != null ? `MHW ${(station.meanHigh / 100).toFixed(2)} m` : "MHW —";
  document.getElementById("badgeMNW").textContent =
    station.meanLow != null ? `MNW ${(station.meanLow / 100).toFixed(2)} m` : "MNW —";

  const link = document.getElementById("stationLink");
  if (station.bshUrl) {
    link.href = station.bshUrl;
    link.style.display = "inline-block";
  } else {
    link.style.display = "none";
  }

  const note = document.getElementById("forecastNote");
  if (station.forecastText) {
    note.innerHTML = `<b>BSH-Vorhersagehinweis:</b> ${station.forecastText}`;
    note.hidden = false;
  } else {
    note.hidden = true;
  }

  renderTideTable(station);
  renderCurve(station);
}

function renderTideTable(station) {
  const tbody = document.getElementById("tideTableBody");
  tbody.innerHTML = "";

  if (!station.events.length) {
    tbody.innerHTML = `<tr><td colspan="7">Für diesen Pegel liegen aktuell keine Tidenscheitel-Vorhersagen vor.</td></tr>`;
    return;
  }

  const now = new Date();

  station.events.forEach((ev) => {
    const t = parseBshTimestamp(ev.event_timestamp);
    if (!t) return;

    const phase = moonPhase(t.jsDate);
    const tt = tideType(phase);
    const isHW = ev.event === "HW";
    const valueCm = ev.forecast_value ?? ev.tidal_prediction_value;
    const valueStr = valueCm != null ? `${(valueCm / 100).toFixed(2)} m` : "—";

    const tr = document.createElement("tr");
    const isPast = t.jsDate < now;
    if (isPast) tr.classList.add("is-past");

    tr.innerHTML = `
      <td>${t.dateStr}</td>
      <td>${t.localTimeStr} Uhr</td>
      <td>${t.utcTimeStr} UTC</td>
      <td><span class="event-pill ${isHW ? "hw" : "nw"}">${isHW ? "🔺 Hochwasser" : "🔻 Niedrigwasser"}</span></td>
      <td>${valueStr}</td>
      <td><span class="tide-type ${tt.key}">${tt.label}</span></td>
      <td class="moon-cell" title="${moonLabel(phase)}">${moonEmoji(phase)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderCurve(station) {
  const svg = document.getElementById("curveChart");
  svg.innerHTML = "";

  const points = (station.curve || [])
    .map((c) => {
      const t = parseBshTimestamp(c.timestamp);
      const val = c.measurement ?? c.tidal_prediction ?? c.automated_curve_forecast;
      if (!t || val == null) return null;
      return { x: t.jsDate.getTime(), y: +val };
    })
    .filter(Boolean);

  if (points.length < 2) {
    svg.innerHTML = `<text x="20" y="110" fill="#4B5A50" font-size="14">Keine Kurvendaten verfügbar.</text>`;
    return;
  }

  const W = 900, H = 220, PAD = 30;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);

  const scaleX = (x) => PAD + ((x - xMin) / (xMax - xMin || 1)) * (W - 2 * PAD);
  const scaleY = (y) => H - PAD - ((y - yMin) / (yMax - yMin || 1)) * (H - 2 * PAD);

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${scaleX(p.x).toFixed(1)},${scaleY(p.y).toFixed(1)}`)
    .join(" ");

  const areaPath = `${path} L${scaleX(xs[xs.length - 1]).toFixed(1)},${H - PAD} L${scaleX(xs[0]).toFixed(1)},${H - PAD} Z`;

  const nsUri = "http://www.w3.org/2000/svg";
  const area = document.createElementNS(nsUri, "path");
  area.setAttribute("d", areaPath);
  area.setAttribute("fill", "rgba(30,91,59,0.12)");
  svg.appendChild(area);

  const line = document.createElementNS(nsUri, "path");
  line.setAttribute("d", path);
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", "#17472F");
  line.setAttribute("stroke-width", "2.5");
  line.setAttribute("stroke-linejoin", "round");
  svg.appendChild(line);

  // "Jetzt"-Linie
  const now = Date.now();
  if (now >= xMin && now <= xMax) {
    const nowX = scaleX(now);
    const nowLine = document.createElementNS(nsUri, "line");
    nowLine.setAttribute("x1", nowX);
    nowLine.setAttribute("x2", nowX);
    nowLine.setAttribute("y1", PAD);
    nowLine.setAttribute("y2", H - PAD);
    nowLine.setAttribute("stroke", "#B8934C");
    nowLine.setAttribute("stroke-width", "1.5");
    nowLine.setAttribute("stroke-dasharray", "4 3");
    svg.appendChild(nowLine);
  }
}

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------

async function init() {
  const lastUpdateEl = document.getElementById("lastUpdate");
  try {
    state.stations = await loadStations();
    state.filteredStations = state.stations;
    populateStateFilter(state.stations);
    applyFilters();
    lastUpdateEl.textContent = `${state.stations.length} Pegel geladen · ${new Date().toLocaleString("de-DE")}`;
  } catch (err) {
    console.error(err);
    lastUpdateEl.textContent = "Datenabruf fehlgeschlagen";
    const msg = document.getElementById("stateMessage");
    msg.hidden = false;
    document.getElementById("emptyState").hidden = true;
    msg.innerHTML = `
      <span class="empty-icon">⚠️</span>
      <p><b>Die BSH-Wasserstandsdaten konnten nicht geladen werden.</b><br>
      Das kann an einer fehlenden Internetverbindung oder an CORS-Einschränkungen des Browsers liegen.
      Bitte lade die Seite neu oder versuche es später erneut.</p>
    `;
  }

  document.getElementById("regionSelect").addEventListener("change", applyFilters);
  document.getElementById("stateSelect").addEventListener("change", applyFilters);

  const searchInput = document.getElementById("stationSearch");
  searchInput.addEventListener("input", () => {
    const v = searchInput.value.trim();
    if (v.length === 0) {
      document.getElementById("stationDropdown").hidden = true;
      return;
    }
    renderStationDropdown(v);
  });
  searchInput.addEventListener("focus", () => {
    if (searchInput.value.trim().length > 0) renderStationDropdown(searchInput.value.trim());
  });

  document.addEventListener("click", (e) => {
    const dropdown = document.getElementById("stationDropdown");
    if (!dropdown.contains(e.target) && e.target !== searchInput) {
      dropdown.hidden = true;
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
