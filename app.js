// app.js - Interaktive Gezeiten-Webseite (Deutsch)
// Lädt Stationen vom BSH-API, wählt automatisch eine Station (geolokation oder erste Station)
// Zeigt Gezeitenkurve, Hoch-/Niedrigwasser-Ereignisse und Rohdaten an.

const COLLECTIONS_URL = 'https://gdi.bsh.de/ldproxy/rest/services/WaterLevelForecast/collections/waterlevelforecastdata/items?f=json';
const ITEM_URL = id => `https://gdi.bsh.de/ldproxy/rest/services/WaterLevelForecast/collections/waterlevelforecastdata/items/${id}/?f=json`;

// DOM
const stationSearch = document.getElementById('stationSearch');
const stationList = document.getElementById('stationList');
const stationNameEl = document.getElementById('stationName');
const stationCoordsEl = document.getElementById('stationCoords');
const stationMetaEl = document.getElementById('stationMeta');
const nowEl = document.getElementById('now');
const refreshBtn = document.getElementById('refreshBtn');
const eventsTableBody = document.querySelector('#eventsTable tbody');
const rawJsonEl = document.getElementById('rawJson');

let stations = [];
let currentStation = null;
let chart = null;

// Update clock
function updateClock(){
  const now = new Date();
  nowEl.textContent = `Lokale Zeit: ${now.toLocaleString('de-DE')}`;
}
setInterval(updateClock, 1000);
updateClock();

// Fetch list of stations
async function loadStations(){
  try{
    const res = await fetch(COLLECTIONS_URL);
    const data = await res.json();
    // data.features expected
    stations = (data.features || []).map(f => ({
      id: f.id || f.properties?.id || f.properties?.gauge_id,
      name: f.properties?.gauge_label || f.properties?.name || f.id,
      coords: f.geometry?.coordinates ? [f.geometry.coordinates[1], f.geometry.coordinates[0]] : null,
      raw: f
    })).filter(s=>s.id);

    renderStationList();
    // try geolocation to pick nearest
    tryGeolocation();
  }catch(err){
    console.error('Stationsliste laden fehlgeschlagen', err);
    stationNameEl.textContent = 'Fehler beim Laden der Stationsliste';
    rawJsonEl.textContent = String(err);
  }
}

function renderStationList(filterText=''){
  stationList.innerHTML = '';
  const filt = filterText.trim().toLowerCase();
  const items = stations.filter(s => !filt || s.name.toLowerCase().includes(filt));
  items.slice(0,20).forEach(s => {
    const div = document.createElement('div');
    div.className = 'stationItem';
    div.textContent = `${s.name} — ${s.id}`;
    div.onclick = ()=> selectStation(s.id);
    stationList.appendChild(div);
  });
}

stationSearch.addEventListener('input', e=> renderStationList(e.target.value));

// Select station
async function selectStation(id){
  const st = stations.find(s=>s.id===id);
  if(!st) return;
  currentStation = st;
  stationNameEl.textContent = `${st.name} (${st.id})`;
  stationCoordsEl.textContent = st.coords ? `Koordinaten: ${st.coords[0].toFixed(5)}, ${st.coords[1].toFixed(5)}` : '';
  stationMetaEl.textContent = 'Lade Daten…';

  try{
    const res = await fetch(ITEM_URL(id));
    const item = await res.json();
    rawJsonEl.textContent = JSON.stringify(item, null, 2);
    renderStationData(item);
  }catch(err){
    console.error('Station Daten laden fehlgeschlagen', err);
    stationMetaEl.textContent = 'Fehler beim Laden der Stationdaten';
    rawJsonEl.textContent = String(err);
  }
}

// Render data: curve + events
function renderStationData(item){
  const props = item.properties || {};
  stationMetaEl.textContent = props.forecast_text ? props.forecast_text : '';

  // curve: array of {timestamp, value}
  const curve = props.curve || [];
  const events = props.high_water_low_water || [];

  // Build chart data
  const labels = curve.map(p => new Date(p.timestamp));
  const values = curve.map(p => p.value);

  // Destroy old chart
  if(chart) chart.destroy();

  const ctx = document.getElementById('tideChart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets:[
        {label:'Wasserstand',data:values, borderColor:'#0b69ff', backgroundColor:'rgba(11,105,255,0.08)', tension:0.2, pointRadius:0},
      ]
    },
    options: {
      responsive:true,
      interaction:{mode:'index',intersect:false},
      scales: {
        x: { type:'time', time:{unit:'hour', tooltipFormat:'dd.MM.y HH:mm'}, title:{display:true, text:'Zeit'} },
        y: { title:{display:true, text:'Wasserstand (API-Einheit)'} }
      },
      plugins: {
        legend:{display:false}
      }
    }
  });

  // Render events table
  eventsTableBody.innerHTML = '';
  if(events.length===0){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="3">Keine Hoch-/Niedrigwasser-Ereignisse in den Daten</td>`;
    eventsTableBody.appendChild(tr);
  }else{
    events.forEach(ev=>{
      const tr = document.createElement('tr');
      const date = new Date(ev.timestamp);
      tr.innerHTML = `<td>${ev.event}</td><td>${date.toLocaleString('de-DE')}</td><td>${ev.value}</td>`;
      eventsTableBody.appendChild(tr);
    });
  }

  // Mark nearest event: scroll to next upcoming
  const now = new Date();
  const upcomingIdx = events.findIndex(e=>new Date(e.timestamp) > now);
  if(upcomingIdx>=0){
    const row = eventsTableBody.children[upcomingIdx];
    if(row) row.style.background = '#fff8e1';
  }
}

// Try to pick station by geolocation
async function tryGeolocation(){
  if(!navigator.geolocation || stations.length===0){
    // fallback: pick first station
    if(stations.length) selectStation(stations[0].id);
    return;
  }
  navigator.geolocation.getCurrentPosition(pos=>{
    const lat = pos.coords.latitude; const lon = pos.coords.longitude;
    // find nearest station
    let best = null; let bestDist = Infinity;
    stations.forEach(s=>{
      if(!s.coords) return;
      const d = haversine(lat,lon,s.coords[0],s.coords[1]);
      if(d < bestDist){ bestDist = d; best = s; }
    });
    if(best) selectStation(best.id);
    else if(stations.length) selectStation(stations[0].id);
  }, err=>{
    // if geolocation fails, pick first station
    if(stations.length) selectStation(stations[0].id);
  }, {timeout:5000});
}

function haversine(lat1,lon1,lat2,lon2){
  const toRad = a => a*Math.PI/180;
  const R = 6371; // km
  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  const c = 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R*c;
}

// Refresh button
refreshBtn.addEventListener('click', ()=>{
  if(currentStation) selectStation(currentStation.id);
});

// Init
loadStations();

// Auto-refresh every 5 minutes to keep data up-to-date
setInterval(()=>{ if(currentStation) selectStation(currentStation.id); }, 5*60*1000);
