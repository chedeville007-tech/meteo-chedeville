const form = document.getElementById("search-form");
const submitBtn = form.querySelector("button");
const spinner = form.querySelector(".spinner");
const statusEl = document.getElementById("status");
const titleEl = document.getElementById("location-title");
const forecastEl = document.getElementById("forecast");

const modal = document.getElementById("hourly-modal");
const modalHeader = document.getElementById("modal-header");
const modalBody = document.getElementById("modal-body");
const modalClose = document.getElementById("modal-close");

let currentDays = [];

function formatDate(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
}

function isToday(isoDate) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
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
      <div>☀️ UV ${day.uv_index_max ?? "-"}</div>
      <div>💧 ${day.precipitation_probability_max ?? 0}%</div>
      <div><span class="wind-arrow" style="transform: rotate(${day.wind_direction ?? 0}deg);">⬇️</span>${Math.round(day.wind_speed_max)} km/h ${day.wind_compass}</div>
      <div>🌀 ${day.pressure ?? "-"} hPa</div>
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

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const city = document.getElementById("city").value.trim();
  const activity = document.getElementById("activity").value;

  titleEl.textContent = "";
  forecastEl.innerHTML = "";
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

    const loc = data.location;
    titleEl.textContent = `📍 ${loc.name}${loc.admin1 ? ", " + loc.admin1 : ""}, ${loc.country} — Activité : ${data.activity}`;

    currentDays.forEach((day, index) => forecastEl.appendChild(renderDayCard(day, index)));
  } catch (err) {
    setStatus("Impossible de contacter le serveur.", "error");
  } finally {
    setLoading(false);
  }
});
