// ===================== Onglets =====================
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    tabPanels.forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");

    if (btn.dataset.tab === "actu") loadNews();
    if (btn.dataset.tab === "bourse") loadIndices();
    if (btn.dataset.tab === "transport") loadTransit();
    if (btn.dataset.tab === "historique" && typeof loadHistory === "function") loadHistory();
    if (btn.dataset.tab === "calendrier" && typeof loadEvents === "function") loadEvents();
    if (btn.dataset.tab === "notes" && typeof loadNotes === "function") loadNotes();
  });
});

// ===================== Météo =====================
const form = document.getElementById("search-form");
const submitBtn = form.querySelector("button[type=submit]");
const spinner = form.querySelector(".spinner");
const statusEl = document.getElementById("status");
const titleEl = document.getElementById("location-title");
const forecastEl = document.getElementById("forecast");
const sunMoonEl = document.getElementById("sun-moon");
const chartSection = document.getElementById("chart-section");
const geolocBtn = document.getElementById("geoloc-btn");
const cityInput = document.getElementById("city");
const activitySelect = document.getElementById("activity");
const favoritesBar = document.getElementById("favorites-bar");

const modal = document.getElementById("hourly-modal");
const modalHeader = document.getElementById("modal-header");
const modalBody = document.getElementById("modal-body");
const modalClose = document.getElementById("modal-close");

let currentDays = [];
let currentLocation = null;
let trendChart = null;

const FAVORITES_KEY = "meteo_favorites";
const MAX_FAVORITES = 3;

function formatDate(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
}

function formatDateShort(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
}

function isToday(isoDate) {
  const todayStr = new Date().toISOString().slice(0, 10);
  return isoDate === todayStr;
}

function setStatus(message, type) {
  statusEl.textContent = message || "";
  statusEl.className = type || "";
}

function setLoading(loading) {
  submitBtn.disabled = loading;
  spinner.hidden = !loading;
}

// ---------- Favoris (localStorage) ----------
function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || [];
  } catch {
    return [];
  }
}

function saveFavorites(favs) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

function addFavorite(city, activity) {
  let favs = getFavorites().filter((f) => f.city.toLowerCase() !== city.toLowerCase());
  favs.unshift({ city, activity });
  favs = favs.slice(0, MAX_FAVORITES);
  saveFavorites(favs);
  renderFavorites();
}

function removeFavorite(city, e) {
  e.stopPropagation();
  const favs = getFavorites().filter((f) => f.city.toLowerCase() !== city.toLowerCase());
  saveFavorites(favs);
  renderFavorites();
}

function renderFavorites() {
  const favs = getFavorites();
  favoritesBar.innerHTML = "";
  favs.forEach((f) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "favorite-chip";
    chip.innerHTML = `⭐ ${f.city} <span class="remove-fav">✕</span>`;
    chip.addEventListener("click", () => {
      cityInput.value = f.city;
      activitySelect.value = f.activity;
      form.requestSubmit();
    });
    chip.querySelector(".remove-fav").addEventListener("click", (e) => removeFavorite(f.city, e));
    favoritesBar.appendChild(chip);
  });
}

// ---------- Géolocalisation ----------
geolocBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    setStatus("La géolocalisation n'est pas supportée par ce navigateur.", "error");
    return;
  }
  setStatus("Localisation en cours…", "info");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      try {
        const resp = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=fr`
        );
        const data = await resp.json();
        const city = data.city || data.locality || data.principalSubdivision;
        if (!city) {
          setStatus("Impossible de déterminer ta ville depuis ta position.", "error");
          return;
        }
        cityInput.value = city;
        form.requestSubmit();
      } catch {
        setStatus("Impossible de contacter le service de géolocalisation.", "error");
      }
    },
    () => setStatus("Impossible d'accéder à ta position (autorisation refusée ?).", "error")
  );
});

// ---------- Rendu des cartes météo ----------
function renderDayCard(day, index) {
  const card = document.createElement("div");
  card.className = "day-card" + (isToday(day.date) ? " today" : "");
  card.dataset.index = index;

  const adviceItems = day.advice.map((tip) => `<li>${tip}</li>`).join("");
  const todayBadge = isToday(day.date) ? '<span class="today-badge">Aujourd\'hui</span>' : "";

  card.innerHTML = `
    <div class="date-row">
      <span class="date">${formatDate(day.date)}</span>
      ${todayBadge}
    </div>
    <div class="icon">${day.icon}</div>
    <div class="label">${day.label}</div>
    <div class="temps">
      <span class="max">${Math.round(day.temp_max)}°</span>
      <span class="min">${Math.round(day.temp_min)}°</span>
    </div>
    <div class="metrics">
      <div title="Indice UV moyen sur les heures de jour">☀️ UV moy. ${day.uv_index_avg ?? "-"}</div>
      <div>💧 ${day.precipitation_probability_max ?? 0}%</div>
      <div><span class="wind-arrow" style="transform: rotate(${day.wind_direction ?? 0}deg); display:inline-block;">⬇️</span>${Math.round(day.wind_speed_max)} km/h ${day.wind_compass}</div>
      <div>🌀 ${day.pressure ?? "-"} hPa</div>
      <div>${day.air_quality.icon} Air : ${day.air_quality.label}</div>
      <div>${day.moon_icon} ${day.moon_phase}</div>
    </div>
    <div class="advice">
      <strong>Conseil du jour</strong>
      <ul>${adviceItems}</ul>
    </div>
    <div class="hint">Cliquer pour le détail heure par heure ▸</div>
  `;

  card.addEventListener("click", () => openHourlyModal(index));
  return card;
}

function renderHourCard(hour) {
  return `
    <div class="hour-card">
      <div class="hour-time">${hour.time}</div>
      <div class="hour-icon">${hour.icon}</div>
      <div class="hour-temp">${Math.round(hour.temperature)}°</div>
      <div class="hour-metric">☀️ UV ${hour.uv_index ?? "-"}</div>
      <div class="hour-metric">💧 ${hour.precipitation_probability ?? 0}%</div>
      <div class="hour-metric">
        <span class="wind-arrow" style="transform: rotate(${hour.wind_direction ?? 0}deg); display:inline-block;">⬇️</span>
        ${Math.round(hour.wind_speed)} km/h ${hour.wind_compass}
      </div>
      <div class="hour-metric">🌀 ${hour.pressure ? Math.round(hour.pressure) : "-"} hPa</div>
      <div class="hour-metric">${hour.aqi_icon} Air ${hour.aqi ?? "-"}</div>
    </div>
  `;
}

function openHourlyModal(index) {
  const day = currentDays[index];
  if (!day) return;

  modalHeader.textContent = `Détail heure par heure — ${formatDate(day.date)}`;
  modalBody.innerHTML = day.hourly.map(renderHourCard).join("");
  modal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = "";
}

modalClose.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.hidden) closeModal();
});

// ---------- Graphique tendances (Chart.js) ----------
function renderTrendChart(days) {
  const labels = days.map((d) => formatDateShort(d.date));
  const tempMax = days.map((d) => d.temp_max);
  const tempMin = days.map((d) => d.temp_min);
  const pressure = days.map((d) => d.pressure);

  if (trendChart) trendChart.destroy();

  const ctx = document.getElementById("trend-chart").getContext("2d");
  trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Température max (°C)",
          data: tempMax,
          borderColor: "#e2632f",
          backgroundColor: "transparent",
          yAxisID: "y",
          tension: 0.3,
        },
        {
          label: "Température min (°C)",
          data: tempMin,
          borderColor: "#3aa0e8",
          backgroundColor: "transparent",
          yAxisID: "y",
          tension: 0.3,
        },
        {
          label: "Pression (hPa)",
          data: pressure,
          borderColor: "#8e6cc4",
          backgroundColor: "transparent",
          yAxisID: "y1",
          tension: 0.3,
          borderDash: [6, 4],
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { type: "linear", position: "left", title: { display: true, text: "°C" } },
        y1: { type: "linear", position: "right", title: { display: true, text: "hPa" }, grid: { drawOnChartArea: false } },
      },
    },
  });

  chartSection.hidden = false;
}

// ---------- Soumission du formulaire météo ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const city = cityInput.value.trim();
  const activity = activitySelect.value;

  titleEl.textContent = "";
  forecastEl.innerHTML = "";
  sunMoonEl.hidden = true;
  chartSection.hidden = true;
  setStatus("Chargement des prévisions…", "info");
  setLoading(true);

  try {
    const resp = await fetch(`/api/weather?city=${encodeURIComponent(city)}&activity=${encodeURIComponent(activity)}`);
    const data = await resp.json();

    if (!resp.ok) {
      setStatus(data.error || "Une erreur est survenue.", "error");
      return;
    }

    setStatus("", "");
    currentDays = data.days;
    currentLocation = data.location;

    const loc = data.location;
    titleEl.innerHTML = `📍 ${loc.name}${loc.admin1 ? ", " + loc.admin1 : ""}, ${loc.country} — Activité : ${data.activity}
      <button id="add-fav-btn" type="button" title="Ajouter aux favoris" style="margin-left:10px;cursor:pointer;border:none;background:none;font-size:1.1rem;">⭐</button>`;
    document.getElementById("add-fav-btn").addEventListener("click", () => addFavorite(loc.name, activity));

    const today = currentDays[0];
    if (today) {
      sunMoonEl.innerHTML = `
        <span>🌅 Lever : ${today.sunrise}</span>
        <span>🌇 Coucher : ${today.sunset}</span>
        <span>${today.moon_icon} ${today.moon_phase}</span>
      `;
      sunMoonEl.hidden = false;
    }

    currentDays.forEach((day, index) => forecastEl.appendChild(renderDayCard(day, index)));
    renderTrendChart(currentDays);

    if (typeof saveWeatherToHistory === "function") {
      saveWeatherToHistory(loc.name, loc.country, activity);
    }
  } catch (err) {
    setStatus("Impossible de contacter le serveur.", "error");
  } finally {
    setLoading(false);
  }
});

renderFavorites();

// ===================== Actu du monde =====================
let newsLoaded = false;

async function loadNews() {
  if (newsLoaded) return;
  const box = document.getElementById("news-box");
  box.textContent = "Chargement…";
  try {
    const resp = await fetch("/api/news");
    const data = await resp.json();
    if (!resp.ok) {
      box.textContent = data.error || "Erreur lors du chargement.";
      return;
    }
    if (!data.items || data.items.length === 0) {
      box.textContent = "Aucune actualité disponible pour le moment.";
      return;
    }
    box.innerHTML = data.items
      .map(
        (item) => `
        <a class="news-item" href="${item.link}" target="_blank" rel="noopener noreferrer">
          <div class="news-title">${item.title}</div>
          <div class="news-date">${item.pub_date || ""}</div>
        </a>
      `
      )
      .join("");
    newsLoaded = true;
  } catch {
    box.textContent = "Impossible de récupérer les actualités.";
  }
}

// ===================== Bourse =====================
const indicesBar = document.getElementById("indices-bar");
const stockSearchInput = document.getElementById("stock-search-input");
const stockSearchResults = document.getElementById("stock-search-results");
const stockBox = document.getElementById("stock-box");

const PERIODS = [
  { key: "1h", label: "Dernière heure" },
  { key: "1d", label: "Journée" },
  { key: "1w", label: "Semaine" },
  { key: "1y", label: "Année" },
  { key: "10y", label: "Décennie" },
];

let currentSymbol = null;
let currentSymbolName = null;
let currentPeriod = "1d";
let stockChart = null;
let indicesLoaded = false;
let searchDebounceTimer = null;

async function loadIndices() {
  if (indicesLoaded) return;
  try {
    const resp = await fetch("/api/stocks/majors");
    const data = await resp.json();
    indicesBar.innerHTML = "";
    (data.indices || []).forEach((idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "index-btn";
      btn.textContent = idx.name;
      btn.addEventListener("click", () => selectSymbol(idx.symbol, idx.name, btn));
      indicesBar.appendChild(btn);
    });
    indicesLoaded = true;
  } catch {
    indicesBar.textContent = "Impossible de charger les indices.";
  }
}

function selectSymbol(symbol, name, activeBtn) {
  currentSymbol = symbol;
  currentSymbolName = name;
  document.querySelectorAll(".index-btn").forEach((b) => b.classList.remove("active"));
  if (activeBtn) activeBtn.classList.add("active");
  stockSearchResults.hidden = true;
  stockSearchInput.value = name;
  loadStockQuote();
}

stockSearchInput.addEventListener("input", () => {
  clearTimeout(searchDebounceTimer);
  const query = stockSearchInput.value.trim();
  if (query.length < 2) {
    stockSearchResults.hidden = true;
    return;
  }
  searchDebounceTimer = setTimeout(async () => {
    try {
      const resp = await fetch(`/api/stocks/search?q=${encodeURIComponent(query)}`);
      const data = await resp.json();
      const results = data.results || [];
      if (!results.length) {
        stockSearchResults.hidden = true;
        return;
      }
      stockSearchResults.innerHTML = results
        .map(
          (r) => `<div class="stock-result" data-symbol="${r.symbol}" data-name="${r.name}">
            <span>${r.name}</span><span class="exchange">${r.symbol} · ${r.exchange || ""}</span>
          </div>`
        )
        .join("");
      stockSearchResults.hidden = false;
      stockSearchResults.querySelectorAll(".stock-result").forEach((el) => {
        el.addEventListener("click", () => {
          document.querySelectorAll(".index-btn").forEach((b) => b.classList.remove("active"));
          selectSymbol(el.dataset.symbol, el.dataset.name, null);
        });
      });
    } catch {
      stockSearchResults.hidden = true;
    }
  }, 300);
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".stock-search")) stockSearchResults.hidden = true;
});

function renderPeriodSelector() {
  const bar = document.createElement("div");
  bar.className = "period-selector";
  PERIODS.forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "period-btn" + (p.key === currentPeriod ? " active" : "");
    btn.textContent = p.label;
    btn.addEventListener("click", () => {
      currentPeriod = p.key;
      loadStockQuote();
    });
    bar.appendChild(btn);
  });
  return bar;
}

async function loadStockQuote() {
  if (!currentSymbol) return;
  stockBox.innerHTML = "Chargement…";
  try {
    const resp = await fetch(`/api/stocks/quote?symbol=${encodeURIComponent(currentSymbol)}&period=${currentPeriod}`);
    const data = await resp.json();

    stockBox.innerHTML = "";
    stockBox.appendChild(renderPeriodSelector());

    if (!resp.ok) {
      const errEl = document.createElement("div");
      errEl.textContent = data.error || "Erreur lors du chargement.";
      stockBox.appendChild(errEl);
      return;
    }

    const header = document.createElement("div");
    header.className = "stock-header";
    const changeClass = (data.change ?? 0) >= 0 ? "up" : "down";
    const changeSign = (data.change ?? 0) >= 0 ? "+" : "";
    header.innerHTML = `
      <span class="stock-name">${data.name} (${data.symbol})</span>
      <span class="stock-price">${data.price != null ? data.price.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : "-"} ${data.currency || ""}</span>
      ${
        data.change != null
          ? `<span class="stock-change ${changeClass}">${changeSign}${data.change} (${changeSign}${data.change_pct}%)</span>`
          : ""
      }
    `;
    stockBox.appendChild(header);

    const canvasWrap = document.createElement("div");
    canvasWrap.innerHTML = '<canvas id="stock-chart" height="90"></canvas>';
    stockBox.appendChild(canvasWrap);

    if (stockChart) stockChart.destroy();
    const ctx = document.getElementById("stock-chart").getContext("2d");
    stockChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: data.points.map((p) => p.label),
        datasets: [
          {
            label: `${data.name} — ${data.period_label}`,
            data: data.points.map((p) => p.price),
            borderColor: "#1d7fd1",
            backgroundColor: "rgba(29,127,209,0.1)",
            fill: true,
            tension: 0.25,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        interaction: { mode: "index", intersect: false },
        scales: { y: { ticks: { callback: (v) => v.toLocaleString("fr-FR") } } },
      },
    });
  } catch {
    stockBox.textContent = "Impossible de contacter le service financier.";
  }
}

// ===================== Transports =====================
const transitSearchForm = document.getElementById("transit-search-form");
const transitCityInput = document.getElementById("transit-city");
const transitStopSelectWrap = document.getElementById("transit-stop-select-wrap");
const transitStopSelect = document.getElementById("transit-stop-select");
const transitBox = document.getElementById("transit-box");

let transitLocation = null;
let transitTriedDefault = false;

function loadTransit() {
  if (transitLocation) {
    loadNearbyStops(transitLocation);
  } else if (!transitTriedDefault && currentLocation) {
    transitTriedDefault = true;
    transitLocation = currentLocation;
    transitCityInput.value = currentLocation.name;
    loadNearbyStops(transitLocation);
  } else if (!currentLocation) {
    transitBox.textContent = "Recherche une ville ci-dessus, ou dans l'onglet Météo.";
  }
}

transitSearchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const city = transitCityInput.value.trim();
  if (!city) return;

  transitBox.textContent = "Recherche de la ville…";
  transitStopSelectWrap.hidden = true;
  try {
    const resp = await fetch(`/api/geocode?city=${encodeURIComponent(city)}`);
    const data = await resp.json();
    if (!resp.ok) {
      transitBox.textContent = data.error || "Ville introuvable.";
      return;
    }
    transitLocation = data;
    loadNearbyStops(transitLocation);
  } catch {
    transitBox.textContent = "Impossible de contacter le service de géocodage.";
  }
});

async function loadNearbyStops(location) {
  transitBox.textContent = "Recherche des arrêts à proximité…";
  transitStopSelectWrap.hidden = true;
  try {
    const resp = await fetch(`/api/transit/stops?lat=${location.lat}&lon=${location.lon}`);
    const data = await resp.json();
    if (!resp.ok) {
      transitBox.textContent = data.error || "Erreur lors du chargement.";
      return;
    }
    if (!data.stops || data.stops.length === 0) {
      transitBox.textContent = "Aucun arrêt trouvé à proximité.";
      return;
    }

    transitStopSelect.innerHTML = data.stops
      .map((stop) => `<option value="${stop.id}">🚉 ${stop.name} (${stop.distance} m)</option>`)
      .join("");
    transitStopSelectWrap.hidden = false;
    loadDepartures(data.stops[0].id, `🚉 ${data.stops[0].name} (${data.stops[0].distance} m)`);
  } catch {
    transitBox.textContent = "Impossible de contacter le service de transport.";
  }
}

transitStopSelect.addEventListener("change", () => {
  const selected = transitStopSelect.options[transitStopSelect.selectedIndex];
  loadDepartures(transitStopSelect.value, selected.textContent);
});

async function loadDepartures(stopId, stopLabel) {
  transitBox.textContent = "Chargement des horaires…";
  try {
    const resp = await fetch(`/api/transit/departures?stop_id=${encodeURIComponent(stopId)}`);
    const data = await resp.json();
    if (!resp.ok) {
      transitBox.textContent = data.error || "Erreur lors du chargement.";
      return;
    }
    const departures = data.departures || [];
    const departuresHtml = departures.length
      ? departures
          .map((d) => `<span class="transit-departure"><span class="time">${d.time}</span> ${d.line} → ${d.direction}</span>`)
          .join("")
      : '<span class="hint-text">Aucun horaire disponible pour cet arrêt.</span>';

    transitBox.innerHTML = `
      <div class="transit-stop">
        <div class="transit-stop-name">${stopLabel}</div>
        <div>${departuresHtml}</div>
      </div>
    `;
  } catch {
    transitBox.textContent = "Impossible de contacter le service de transport.";
  }
}
