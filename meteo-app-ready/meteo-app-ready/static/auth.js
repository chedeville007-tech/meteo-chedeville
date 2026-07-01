// ===================== Client Supabase =====================
const supabaseClient = (window.SUPABASE_URL && window.SUPABASE_ANON_KEY)
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

let currentUser = null;

// ---------- Éléments DOM ----------
const accountBtn = document.getElementById("account-btn");
const authModal = document.getElementById("auth-modal");
const authModalClose = document.getElementById("auth-modal-close");
const authLoggedOut = document.getElementById("auth-logged-out");
const authLoggedIn = document.getElementById("auth-logged-in");
const authForm = document.getElementById("auth-form");
const authTitle = document.getElementById("auth-title");
const authSubmitBtn = document.getElementById("auth-submit-btn");
const authSwitchBtn = document.getElementById("auth-switch-btn");
const authSwitch = document.getElementById("auth-switch");
const authError = document.getElementById("auth-error");
const authUserEmail = document.getElementById("auth-user-email");
const googleLoginBtn = document.getElementById("google-login-btn");
const logoutBtn = document.getElementById("logout-btn");

let isSignupMode = false;

function openAuthModal() {
  authModal.hidden = false;
}
function closeAuthModal() {
  authModal.hidden = true;
  authError.textContent = "";
}

accountBtn.addEventListener("click", openAuthModal);
authModalClose.addEventListener("click", closeAuthModal);
authModal.addEventListener("click", (e) => {
  if (e.target === authModal) closeAuthModal();
});

authSwitchBtn.addEventListener("click", () => {
  isSignupMode = !isSignupMode;
  authTitle.textContent = isSignupMode ? "Créer un compte" : "Connexion";
  authSubmitBtn.textContent = isSignupMode ? "Créer mon compte" : "Se connecter";
  authSwitch.innerHTML = isSignupMode
    ? `Déjà un compte ? <button type="button" id="auth-switch-btn" class="link-btn">Se connecter</button>`
    : `Pas encore de compte ? <button type="button" id="auth-switch-btn" class="link-btn">Créer un compte</button>`;
  document.getElementById("auth-switch-btn").addEventListener("click", () => authSwitchBtn.click());
});

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!supabaseClient) {
    authError.textContent = "Connexion non configurée (Supabase manquant).";
    return;
  }
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  authError.textContent = "";

  const { data, error } = isSignupMode
    ? await supabaseClient.auth.signUp({ email, password })
    : await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    authError.textContent = error.message;
    return;
  }

  if (isSignupMode && !data.session) {
    authError.textContent = "Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse.";
    return;
  }

  closeAuthModal();
});

googleLoginBtn.addEventListener("click", async () => {
  if (!supabaseClient) return;
  await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
});

logoutBtn.addEventListener("click", async () => {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  closeAuthModal();
});

function updateAuthUI(user) {
  currentUser = user;
  if (user) {
    accountBtn.textContent = `👤 ${user.email}`;
    authLoggedOut.hidden = true;
    authLoggedIn.hidden = false;
    authUserEmail.textContent = user.email;
  } else {
    accountBtn.textContent = "👤 Se connecter";
    authLoggedOut.hidden = false;
    authLoggedIn.hidden = true;
  }

  document.querySelectorAll(".auth-required").forEach((el) => (el.hidden = !!user));
  const eventForm = document.getElementById("event-form");
  const noteForm = document.getElementById("note-form");
  if (eventForm) eventForm.hidden = !user;
  if (noteForm) noteForm.hidden = !user;

  if (user) {
    loadHistory();
    loadEvents();
    loadNotes();
  } else {
    document.getElementById("history-box").innerHTML = "";
    document.getElementById("events-box").innerHTML = "";
    document.getElementById("notes-box").innerHTML = "";
  }
}

if (supabaseClient) {
  supabaseClient.auth.getSession().then(({ data }) => {
    updateAuthUI(data.session ? data.session.user : null);
  });
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    updateAuthUI(session ? session.user : null);
  });
} else {
  accountBtn.disabled = true;
  accountBtn.title = "Connexion non configurée";
}

// ===================== Historique météo =====================
async function saveWeatherToHistory(city, country, activity) {
  if (!supabaseClient || !currentUser) return;
  await supabaseClient.from("weather_history").insert({
    user_id: currentUser.id,
    city,
    country,
    activity,
  });
}

async function loadHistory() {
  const box = document.getElementById("history-box");
  if (!supabaseClient || !currentUser) return;
  box.textContent = "Chargement…";

  const { data, error } = await supabaseClient
    .from("weather_history")
    .select("*")
    .order("searched_at", { ascending: false })
    .limit(50);

  if (error) {
    box.textContent = "Erreur de chargement de l'historique.";
    return;
  }
  if (!data.length) {
    box.textContent = "Aucune recherche enregistrée pour l'instant.";
    return;
  }

  box.innerHTML = data
    .map((row) => {
      const date = new Date(row.searched_at).toLocaleString("fr-FR");
      return `<div class="list-row">
        <span>📍 <strong>${row.city}</strong>${row.country ? ", " + row.country : ""}${row.activity ? " — " + row.activity : ""}</span>
        <span class="list-row-date">${date}</span>
      </div>`;
    })
    .join("");
}

// ===================== Calendrier =====================
const eventForm = document.getElementById("event-form");
if (eventForm) {
  eventForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!supabaseClient || !currentUser) return;
    const title = document.getElementById("event-title").value.trim();
    const eventDate = document.getElementById("event-date").value;
    const note = document.getElementById("event-note").value.trim();

    await supabaseClient.from("events").insert({
      user_id: currentUser.id,
      title,
      event_date: eventDate,
      note: note || null,
    });

    eventForm.reset();
    loadEvents();
  });
}

async function loadEvents() {
  const box = document.getElementById("events-box");
  if (!supabaseClient || !currentUser) return;
  box.textContent = "Chargement…";

  const { data, error } = await supabaseClient
    .from("events")
    .select("*")
    .order("event_date", { ascending: true });

  if (error) {
    box.textContent = "Erreur de chargement du calendrier.";
    return;
  }
  if (!data.length) {
    box.textContent = "Aucun événement pour l'instant.";
    return;
  }

  box.innerHTML = data
    .map((row) => {
      const date = new Date(row.event_date + "T00:00:00").toLocaleDateString("fr-FR", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      });
      return `<div class="list-row">
        <span>🗓️ <strong>${row.title}</strong> — ${date}${row.note ? "<br><em>" + row.note + "</em>" : ""}</span>
        <button class="delete-btn" data-id="${row.id}" data-kind="events" title="Supprimer">🗑️</button>
      </div>`;
    })
    .join("");

  attachDeleteHandlers();
}

// ===================== Notes =====================
const noteForm = document.getElementById("note-form");
if (noteForm) {
  noteForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!supabaseClient || !currentUser) return;
    const content = document.getElementById("note-content").value.trim();

    await supabaseClient.from("notes").insert({
      user_id: currentUser.id,
      content,
    });

    noteForm.reset();
    loadNotes();
  });
}

async function loadNotes() {
  const box = document.getElementById("notes-box");
  if (!supabaseClient || !currentUser) return;
  box.textContent = "Chargement…";

  const { data, error } = await supabaseClient
    .from("notes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    box.textContent = "Erreur de chargement des notes.";
    return;
  }
  if (!data.length) {
    box.textContent = "Aucune note pour l'instant.";
    return;
  }

  box.innerHTML = data
    .map((row) => {
      const date = new Date(row.created_at).toLocaleDateString("fr-FR");
      return `<div class="list-row">
        <span>📝 ${row.content} <span class="list-row-date">(${date})</span></span>
        <button class="delete-btn" data-id="${row.id}" data-kind="notes" title="Supprimer">🗑️</button>
      </div>`;
    })
    .join("");

  attachDeleteHandlers();
}

// ---------- Suppression (partagée notes / événements) ----------
function attachDeleteHandlers() {
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { id, kind } = btn.dataset;
      await supabaseClient.from(kind).delete().eq("id", id);
      if (kind === "notes") loadNotes();
      if (kind === "events") loadEvents();
    });
  });
}
