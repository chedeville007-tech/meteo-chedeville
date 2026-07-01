// ===================== Notification d'erreur (toast) =====================
function showToast(message) {
  let toast = document.getElementById("app-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "app-toast";
    toast.className = "app-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove("visible"), 6000);
}

// ===================== Thème clair / sombre =====================
const themeToggleBtn = document.getElementById("theme-toggle-btn");

function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    themeToggleBtn.textContent = "☀️";
  } else {
    document.documentElement.removeAttribute("data-theme");
    themeToggleBtn.textContent = "🌙";
  }
  localStorage.setItem("theme", theme);
}

applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

themeToggleBtn.addEventListener("click", () => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  applyTheme(isDark ? "light" : "dark");
});

// ===================== Onglets =====================
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    tabPanels.forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");

    if (btn.dataset.tab === "accueil") renderDashboard();
    if (btn.dataset.tab === "actu") loadNews();
    if (btn.dataset.tab === "bourse") loadIndices();
    if (btn.dataset.tab === "transport") loadTransit();
    if (btn.dataset.tab === "calendrier") renderCalendar();
    if (btn.dataset.tab === "notes" && typeof loadNotes === "function") loadNotes();
    if (btn.dataset.tab === "reglages") loadSettingsForm();
  });
});

// ===================== Sous-onglets (Favoris) =====================
document.querySelectorAll(".sub-tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const scope = btn.closest("section");
    scope.querySelectorAll(".sub-tab-btn").forEach((b) => b.classList.remove("active"));
    scope.querySelectorAll(".sub-tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`subtab-${btn.dataset.subtab}`).classList.add("active");
    if (btn.dataset.subtab === "bourse-devises") loadCurrencies();
    if (btn.dataset.subtab === "bourse-favoris") loadStockFavorites();
    if (btn.dataset.subtab === "transport-favoris") loadTransitFavoritesList();
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

// ---------- Favoris météo (Supabase, nécessite d'être connecté) ----------
async function addFavorite(city, activity) {
  if (!currentUser) return;
  await addFavoriteDb("weather", city, { city, activity });
  renderFavorites();
}

async function renderFavorites() {
  if (!currentUser) {
    favoritesBar.innerHTML = "";
    return;
  }
  const favs = await fetchFavorites("weather");
  favoritesBar.innerHTML = "";
  favs.forEach((f) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "favorite-chip";
    chip.innerHTML = `⭐ ${f.label} <span class="remove-fav">✕</span>`;
    chip.addEventListener("click", () => {
      cityInput.value = f.payload.city;
      activitySelect.value = f.payload.activity;
      form.requestSubmit();
    });
    chip.querySelector(".remove-fav").addEventListener("click", async (e) => {
      e.stopPropagation();
      await removeFavoriteDb(f.id);
      renderFavorites();
    });
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

// ---------- Unités (°C/°F, km/h/mph) selon les réglages de profil ----------
let userSettings = { unit_temp: "celsius", unit_wind: "kmh" };

function convertTemp(celsius) {
  return userSettings.unit_temp === "fahrenheit" ? (celsius * 9) / 5 + 32 : celsius;
}
function tempSuffix() {
  return userSettings.unit_temp === "fahrenheit" ? "°F" : "°C";
}
function convertWind(kmh) {
  return userSettings.unit_wind === "mph" ? kmh / 1.60934 : kmh;
}
function windSuffix() {
  return userSettings.unit_wind === "mph" ? "mph" : "km/h";
}

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
      <span class="max">${Math.round(convertTemp(day.temp_max))}${tempSuffix()}</span>
      <span class="min">${Math.round(convertTemp(day.temp_min))}${tempSuffix()}</span>
    </div>
    <div class="metrics">
      <div title="Indice UV moyen sur les heures de jour">☀️ UV moy. ${day.uv_index_avg ?? "-"}</div>
      <div>💧 ${day.precipitation_probability_max ?? 0}%</div>
      <div><span class="wind-arrow" style="transform: rotate(${day.wind_direction ?? 0}deg); display:inline-block;">⬇️</span>${Math.round(convertWind(day.wind_speed_max))} ${windSuffix()} ${day.wind_compass}</div>
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
      <div class="hour-temp">${Math.round(convertTemp(hour.temperature))}${tempSuffix()}</div>
      <div class="hour-metric">☀️ UV ${hour.uv_index ?? "-"}</div>
      <div class="hour-metric">💧 ${hour.precipitation_probability ?? 0}%</div>
      <div class="hour-metric">
        <span class="wind-arrow" style="transform: rotate(${hour.wind_direction ?? 0}deg); display:inline-block;">⬇️</span>
        ${Math.round(convertWind(hour.wind_speed))} ${windSuffix()} ${hour.wind_compass}
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
  if (e.key !== "Escape") return;
  if (!modal.hidden) closeModal();
  if (typeof dayModal !== "undefined" && !dayModal.hidden) closeDayModal();
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
    const favBtnHtml = currentUser
      ? `<button id="add-fav-btn" type="button" class="star-btn" title="Ajouter aux favoris">⭐</button>`
      : "";
    titleEl.innerHTML = `📍 ${loc.name}${loc.admin1 ? ", " + loc.admin1 : ""}, ${loc.country} — Activité : ${data.activity} ${favBtnHtml}`;
    if (currentUser) {
      document.getElementById("add-fav-btn").addEventListener("click", () => addFavorite(loc.name, activity));
    }

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
  } catch (err) {
    setStatus("Impossible de contacter le serveur.", "error");
  } finally {
    setLoading(false);
  }
});

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

function renderPeriodSelector(current, onSelect) {
  const bar = document.createElement("div");
  bar.className = "period-selector";
  PERIODS.forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "period-btn" + (p.key === current ? " active" : "");
    btn.textContent = p.label;
    btn.addEventListener("click", () => onSelect(p.key));
    bar.appendChild(btn);
  });
  return bar;
}

function renderQuoteChart(canvasId, label, points) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  return new Chart(ctx, {
    type: "line",
    data: {
      labels: points.map((p) => p.label),
      datasets: [
        {
          label,
          data: points.map((p) => p.price),
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
}

async function loadStockQuote() {
  if (!currentSymbol) return;
  stockBox.innerHTML = "Chargement…";
  try {
    const resp = await fetch(`/api/stocks/quote?symbol=${encodeURIComponent(currentSymbol)}&period=${currentPeriod}`);
    const data = await resp.json();

    stockBox.innerHTML = "";
    stockBox.appendChild(
      renderPeriodSelector(currentPeriod, (key) => {
        currentPeriod = key;
        loadStockQuote();
      })
    );

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
      ${currentUser ? `<button type="button" id="stock-fav-btn" class="star-btn" title="Ajouter aux favoris">⭐</button>` : ""}
      <span class="stock-price">${data.price != null ? data.price.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : "-"} ${data.currency || ""}</span>
      ${
        data.change != null
          ? `<span class="stock-change ${changeClass}">${changeSign}${data.change} (${changeSign}${data.change_pct}%)</span>`
          : ""
      }
    `;
    stockBox.appendChild(header);
    if (currentUser) {
      document.getElementById("stock-fav-btn").addEventListener("click", async () => {
        await addFavoriteDb("stock", data.name, { symbol: data.symbol });
        loadStockFavorites();
      });
    }

    const canvasWrap = document.createElement("div");
    canvasWrap.innerHTML = '<canvas id="stock-chart" height="90"></canvas>';
    stockBox.appendChild(canvasWrap);

    if (stockChart) stockChart.destroy();
    stockChart = renderQuoteChart("stock-chart", `${data.name} — ${data.period_label}`, data.points);
  } catch {
    stockBox.textContent = "Impossible de contacter le service financier.";
  }
}

// ---------- Favoris Bourse ----------
const stockFavoritesList = document.getElementById("stock-favorites-list");

async function loadStockFavorites() {
  if (!stockFavoritesList) return;
  if (!currentUser) {
    stockFavoritesList.innerHTML = "";
    return;
  }
  const favs = await fetchFavorites("stock");
  if (!favs.length) {
    stockFavoritesList.innerHTML = '<p class="hint-text">Aucune entreprise en favoris pour l\'instant. Ouvre une action et clique sur ⭐.</p>';
    return;
  }
  stockFavoritesList.innerHTML = favs
    .map(
      (f) => `
      <div class="favorite-row" data-symbol="${f.payload.symbol}" data-name="${f.label}">
        <span class="favorite-label">${f.label} (${f.payload.symbol})</span>
        <button type="button" class="remove-fav-btn" data-id="${f.id}" title="Retirer">✕</button>
      </div>`
    )
    .join("");

  stockFavoritesList.querySelectorAll(".favorite-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest(".remove-fav-btn")) return;
      document.querySelector('.sub-tab-btn[data-subtab="bourse-parcourir"]').click();
      document.querySelectorAll(".index-btn").forEach((b) => b.classList.remove("active"));
      selectSymbol(row.dataset.symbol, row.dataset.name, null);
    });
  });
  stockFavoritesList.querySelectorAll(".remove-fav-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await removeFavoriteDb(btn.dataset.id);
      loadStockFavorites();
    });
  });
}

// ===================== Devises =====================
const currencyBar = document.getElementById("currency-bar");
const currencyBox = document.getElementById("currency-box");

let currentCurrencySymbol = null;
let currentCurrencyPeriod = "1d";
let currencyChart = null;
let currenciesLoaded = false;

async function loadCurrencies() {
  if (currenciesLoaded) return;
  try {
    const resp = await fetch("/api/stocks/currencies");
    const data = await resp.json();
    currencyBar.innerHTML = "";
    (data.currencies || []).forEach((cur) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "index-btn";
      btn.textContent = cur.name;
      btn.addEventListener("click", () => selectCurrency(cur.symbol, cur.name, btn));
      currencyBar.appendChild(btn);
    });
    currenciesLoaded = true;
  } catch {
    currencyBar.textContent = "Impossible de charger les devises.";
  }
}

function selectCurrency(symbol, name, activeBtn) {
  currentCurrencySymbol = symbol;
  document.querySelectorAll("#currency-bar .index-btn").forEach((b) => b.classList.remove("active"));
  if (activeBtn) activeBtn.classList.add("active");
  loadCurrencyQuote();
}

async function loadCurrencyQuote() {
  if (!currentCurrencySymbol) return;
  currencyBox.innerHTML = "Chargement…";
  try {
    const resp = await fetch(`/api/stocks/quote?symbol=${encodeURIComponent(currentCurrencySymbol)}&period=${currentCurrencyPeriod}`);
    const data = await resp.json();

    currencyBox.innerHTML = "";
    currencyBox.appendChild(
      renderPeriodSelector(currentCurrencyPeriod, (key) => {
        currentCurrencyPeriod = key;
        loadCurrencyQuote();
      })
    );

    if (!resp.ok) {
      const errEl = document.createElement("div");
      errEl.textContent = data.error || "Erreur lors du chargement.";
      currencyBox.appendChild(errEl);
      return;
    }

    const header = document.createElement("div");
    header.className = "stock-header";
    const changeClass = (data.change ?? 0) >= 0 ? "up" : "down";
    const changeSign = (data.change ?? 0) >= 0 ? "+" : "";
    header.innerHTML = `
      <span class="stock-name">${data.name}</span>
      <span class="stock-price">${data.price != null ? data.price.toLocaleString("fr-FR", { maximumFractionDigits: 4 }) : "-"} ${data.currency || ""}</span>
      ${
        data.change != null
          ? `<span class="stock-change ${changeClass}">${changeSign}${data.change} (${changeSign}${data.change_pct}%)</span>`
          : ""
      }
    `;
    currencyBox.appendChild(header);

    const canvasWrap = document.createElement("div");
    canvasWrap.innerHTML = '<canvas id="currency-chart" height="90"></canvas>';
    currencyBox.appendChild(canvasWrap);

    if (currencyChart) currencyChart.destroy();
    currencyChart = renderQuoteChart("currency-chart", `${data.name} — ${data.period_label}`, data.points);
  } catch {
    currencyBox.textContent = "Impossible de contacter le service financier.";
  }
}

// ===================== Transports =====================
const transitSearchForm = document.getElementById("transit-search-form");
const transitCityInput = document.getElementById("transit-city");
const transitStopSelectWrap = document.getElementById("transit-stop-select-wrap");
const transitStopSelect = document.getElementById("transit-stop-select");
const transitFavBtn = document.getElementById("transit-fav-btn");
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

    if (currentUser) {
      transitFavBtn.hidden = false;
      transitFavBtn.onclick = async () => {
        await addFavoriteDb("transit", location.name, { lat: location.lat, lon: location.lon, name: location.name });
        loadTransitFavoritesList();
      };
    } else {
      transitFavBtn.hidden = true;
    }
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

// ---------- Favoris Transports ----------
const transitFavoritesList = document.getElementById("transit-favorites-list");

async function loadTransitFavoritesList() {
  if (!transitFavoritesList) return;
  if (!currentUser) {
    transitFavoritesList.innerHTML = "";
    return;
  }
  const favs = await fetchFavorites("transit");
  if (!favs.length) {
    transitFavoritesList.innerHTML = '<p class="hint-text">Aucune ville en favoris pour l\'instant. Recherche une ville et clique sur ⭐.</p>';
    return;
  }
  transitFavoritesList.innerHTML = favs
    .map(
      (f) => `
      <div class="favorite-row" data-lat="${f.payload.lat}" data-lon="${f.payload.lon}" data-name="${f.payload.name}">
        <span class="favorite-label">🚉 ${f.label}</span>
        <button type="button" class="remove-fav-btn" data-id="${f.id}" title="Retirer">✕</button>
      </div>`
    )
    .join("");

  transitFavoritesList.querySelectorAll(".favorite-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest(".remove-fav-btn")) return;
      document.querySelector('.sub-tab-btn[data-subtab="transport-parcourir"]').click();
      transitLocation = { lat: Number(row.dataset.lat), lon: Number(row.dataset.lon), name: row.dataset.name };
      transitCityInput.value = row.dataset.name;
      loadNearbyStops(transitLocation);
    });
  });
  transitFavoritesList.querySelectorAll(".remove-fav-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await removeFavoriteDb(btn.dataset.id);
      loadTransitFavoritesList();
    });
  });
}

// ===================== Calendrier (vue mois, type Apple Calendar) =====================
const calendarWrap = document.getElementById("calendar-wrap");
const calendarGrid = document.getElementById("calendar-grid");
const calMonthLabel = document.getElementById("cal-month-label");
const dayModal = document.getElementById("day-modal");
const dayModalHeader = document.getElementById("day-modal-header");
const dayModalEvents = document.getElementById("day-modal-events");
const dayEventForm = document.getElementById("day-event-form");

let calMonthDate = startOfMonth(new Date());
let calEvents = [];
let calSelectedDate = null;

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function renderCalendar() {
  if (!currentUser) {
    calendarWrap.hidden = true;
    return;
  }
  calendarWrap.hidden = false;
  calEvents = await fetchEvents();
  renderCalendarGrid();
}

function renderCalendarGrid() {
  const year = calMonthDate.getFullYear();
  const month = calMonthDate.getMonth();
  calMonthLabel.textContent = calMonthDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7; // 0 = lundi
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  const cells = [];
  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push(new Date(year, month - 1, daysInPrevMonth - i));
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, month, d));
  }
  let nextDay = 1;
  while (cells.length < totalCells) {
    cells.push(new Date(year, month + 1, nextDay++));
  }

  const todayIso = toIsoDate(new Date());

  calendarGrid.innerHTML = "";
  cells.forEach((dateObj) => {
    const iso = toIsoDate(dateObj);
    const outside = dateObj.getMonth() !== month;
    const dayEvents = calEvents.filter((e) => e.event_date === iso);

    const cell = document.createElement("div");
    cell.className = "cal-day" + (outside ? " outside-month" : "") + (iso === todayIso ? " today" : "");

    const shown = dayEvents
      .slice(0, 2)
      .map((e) => `<div class="cal-event-pill">${e.title}</div>`)
      .join("");
    const more = dayEvents.length > 2 ? `<div class="cal-event-more">+${dayEvents.length - 2}</div>` : "";

    cell.innerHTML = `<div class="cal-day-number">${dateObj.getDate()}</div><div class="cal-day-events">${shown}${more}</div>`;
    cell.addEventListener("click", () => openDayModal(iso));
    calendarGrid.appendChild(cell);
  });
}

document.getElementById("cal-prev").addEventListener("click", () => {
  calMonthDate = new Date(calMonthDate.getFullYear(), calMonthDate.getMonth() - 1, 1);
  renderCalendarGrid();
});
document.getElementById("cal-next").addEventListener("click", () => {
  calMonthDate = new Date(calMonthDate.getFullYear(), calMonthDate.getMonth() + 1, 1);
  renderCalendarGrid();
});
document.getElementById("cal-today").addEventListener("click", () => {
  calMonthDate = startOfMonth(new Date());
  renderCalendarGrid();
});

function openDayModal(iso) {
  calSelectedDate = iso;
  const d = new Date(iso + "T00:00:00");
  dayModalHeader.textContent = d.toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  renderDayModalEvents();
  dayModal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeDayModal() {
  dayModal.hidden = true;
  document.body.style.overflow = "";
}

document.getElementById("day-modal-close").addEventListener("click", closeDayModal);
dayModal.addEventListener("click", (e) => {
  if (e.target === dayModal) closeDayModal();
});

function renderDayModalEvents() {
  const dayEvents = calEvents.filter((e) => e.event_date === calSelectedDate);
  if (!dayEvents.length) {
    dayModalEvents.innerHTML = '<p class="hint-text">Aucun événement ce jour-là.</p>';
  } else {
    dayModalEvents.innerHTML = dayEvents
      .map(
        (e) => `
        <div class="list-row">
          <span>🗓️ <strong>${e.title}</strong>${e.note ? "<br><em>" + e.note + "</em>" : ""}</span>
          <button type="button" class="delete-btn" data-event-id="${e.id}" title="Supprimer">🗑️</button>
        </div>`
      )
      .join("");
    dayModalEvents.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await deleteEvent(btn.dataset.eventId);
        calEvents = calEvents.filter((e) => e.id !== btn.dataset.eventId);
        renderDayModalEvents();
        renderCalendarGrid();
      });
    });
  }
}

dayEventForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!calSelectedDate) return;
  const title = document.getElementById("day-event-title").value.trim();
  const note = document.getElementById("day-event-note").value.trim();
  if (!title) return;

  const created = await insertEvent(title, calSelectedDate, note);
  if (created) calEvents.push(created);
  dayEventForm.reset();
  renderDayModalEvents();
  renderCalendarGrid();
});

// ===================== Tableau de bord (Accueil) =====================
async function renderDashboard() {
  loadDashboardNews();
  loadDashboardWeather();
  loadDashboardEvent();
  loadDashboardStock();
}

async function loadDashboardNews() {
  const el = document.getElementById("dash-news");
  try {
    const resp = await fetch("/api/news");
    const data = await resp.json();
    if (!resp.ok || !data.items || !data.items.length) {
      el.textContent = "Aucune actu disponible.";
      return;
    }
    const item = data.items[0];
    el.innerHTML = `<a class="news-item" href="${item.link}" target="_blank" rel="noopener noreferrer"><div class="news-title">${item.title}</div></a>`;
  } catch {
    el.textContent = "Impossible de récupérer les actus.";
  }
}

async function loadDashboardWeather() {
  const el = document.getElementById("dash-weather");
  if (!currentUser) {
    el.innerHTML = '<p class="hint-text">Connecte-toi et ajoute une ville en favori (onglet Météo) pour la voir ici.</p>';
    return;
  }
  const favs = await fetchFavorites("weather");
  if (!favs.length) {
    el.innerHTML = '<p class="hint-text">Ajoute une ville en favori dans l\'onglet Météo pour la voir ici.</p>';
    return;
  }
  const fav = favs[0];
  try {
    const resp = await fetch(`/api/weather?city=${encodeURIComponent(fav.payload.city)}&activity=${encodeURIComponent(fav.payload.activity)}`);
    const data = await resp.json();
    if (!resp.ok) {
      el.textContent = data.error || "Erreur météo.";
      return;
    }
    const today = data.days[0];
    el.innerHTML = `
      <div><strong>📍 ${data.location.name}</strong></div>
      <div class="icon">${today.icon}</div>
      <div class="temps"><span class="max">${Math.round(convertTemp(today.temp_max))}${tempSuffix()}</span> <span class="min">${Math.round(convertTemp(today.temp_min))}${tempSuffix()}</span></div>
      <div class="hint-text">${today.label}</div>
    `;
  } catch {
    el.textContent = "Impossible de contacter le service météo.";
  }
}

async function loadDashboardEvent() {
  const el = document.getElementById("dash-event");
  if (!currentUser) {
    el.innerHTML = '<p class="hint-text">Connecte-toi pour voir ton prochain événement.</p>';
    return;
  }
  const events = await fetchEvents();
  const todayIso = toIsoDate(new Date());
  const upcoming = events.filter((e) => e.event_date >= todayIso).sort((a, b) => (a.event_date > b.event_date ? 1 : -1))[0];
  if (!upcoming) {
    el.innerHTML = '<p class="hint-text">Aucun événement à venir. Ajoute-en un dans le Calendrier.</p>';
    return;
  }
  const d = new Date(upcoming.event_date + "T00:00:00");
  el.innerHTML = `
    <div><strong>🗓️ ${upcoming.title}</strong></div>
    <div class="hint-text">${d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</div>
    ${upcoming.note ? `<div class="hint-text"><em>${upcoming.note}</em></div>` : ""}
  `;
}

async function loadDashboardStock() {
  const el = document.getElementById("dash-stock");
  if (!currentUser) {
    el.innerHTML = '<p class="hint-text">Connecte-toi et ajoute une action en favori (onglet Bourse) pour la voir ici.</p>';
    return;
  }
  const favs = await fetchFavorites("stock");
  if (!favs.length) {
    el.innerHTML = '<p class="hint-text">Ajoute une action en favori dans l\'onglet Bourse pour la voir ici.</p>';
    return;
  }
  const fav = favs[0];
  try {
    const resp = await fetch(`/api/stocks/quote?symbol=${encodeURIComponent(fav.payload.symbol)}&period=1d`);
    const data = await resp.json();
    if (!resp.ok) {
      el.textContent = data.error || "Erreur.";
      return;
    }
    const changeClass = (data.change ?? 0) >= 0 ? "up" : "down";
    const changeSign = (data.change ?? 0) >= 0 ? "+" : "";
    el.innerHTML = `
      <div><strong>${data.name}</strong></div>
      <span class="stock-price">${data.price != null ? data.price.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : "-"} ${data.currency || ""}</span>
      ${data.change != null ? `<span class="stock-change ${changeClass}">${changeSign}${data.change_pct}%</span>` : ""}
    `;
  } catch {
    el.textContent = "Impossible de contacter le service financier.";
  }
}

// ===================== Réglages de profil =====================
const settingsForm = document.getElementById("settings-form");
const settingDefaultCity = document.getElementById("setting-default-city");
const settingDefaultActivity = document.getElementById("setting-default-activity");
const settingUnitTemp = document.getElementById("setting-unit-temp");
const settingUnitWind = document.getElementById("setting-unit-wind");
let defaultsApplied = false;

async function loadSettingsForm() {
  if (!currentUser) return;
  const profile = await fetchProfile();
  if (profile) {
    userSettings = profile;
    settingDefaultCity.value = profile.default_city || "";
    settingDefaultActivity.value = profile.default_activity || "aucune";
    settingUnitTemp.value = profile.unit_temp || "celsius";
    settingUnitWind.value = profile.unit_wind || "kmh";
  }
}

settingsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) {
    showToast("Connecte-toi pour enregistrer tes réglages.");
    return;
  }
  const settings = {
    default_city: settingDefaultCity.value.trim() || null,
    default_activity: settingDefaultActivity.value,
    unit_temp: settingUnitTemp.value,
    unit_wind: settingUnitWind.value,
  };
  const saved = await saveProfile(settings);
  if (saved) {
    userSettings = saved;
    showToast("Réglages enregistrés.");
  }
});

async function applyUserDefaults() {
  if (!currentUser || defaultsApplied) return;
  const profile = await fetchProfile();
  if (!profile) return;
  userSettings = profile;
  if (profile.default_city && !cityInput.value) {
    defaultsApplied = true;
    cityInput.value = profile.default_city;
    if (profile.default_activity) activitySelect.value = profile.default_activity;
    form.requestSubmit();
  }
}

// ===================== Point d'entrée central sur changement de connexion =====================
// Appelé par auth.js (updateAuthUI) chaque fois que l'état de connexion change.
function onAuthChanged() {
  renderFavorites();
  loadStockFavorites();
  loadTransitFavoritesList();
  renderCalendar();
  renderDashboard();
  applyUserDefaults();
  if (!currentUser) defaultsApplied = false;
}

// L'onglet Accueil est actif par défaut au chargement : on affiche tout de suite
// les actus (disponibles sans connexion) ; les autres cartes se complètent via onAuthChanged.
renderDashboard();
