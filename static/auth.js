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
  const noteForm = document.getElementById("note-form");
  if (noteForm) noteForm.hidden = !user;
  const taskForm = document.getElementById("task-form");
  if (taskForm) taskForm.hidden = !user;

  if (typeof onAuthChanged === "function") onAuthChanged(user);

  if (user) {
    loadNotes();
    loadTasks();
  } else {
    document.getElementById("notes-box").innerHTML = "";
    document.getElementById("tasks-box").innerHTML = "";
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

// ---------- Remontée d'erreur visible (au lieu d'échouer silencieusement) ----------
function reportDbError(context, error) {
  if (!error) return;
  console.error(`[${context}]`, error);
  const friendly = error.code === "PGRST205"
    ? "La base de données n'est pas configurée (table manquante). Exécute supabase_schema.sql dans Supabase."
    : error.message || "Erreur inconnue.";
  if (typeof showToast === "function") showToast(`Erreur (${context}) : ${friendly}`);
}

// ===================== Calendrier (données) =====================
// Le rendu (grille mensuelle type Apple Calendar) vit dans script.js ;
// ce fichier n'expose que les accès à Supabase.
async function fetchEvents() {
  if (!supabaseClient || !currentUser) return [];
  const { data, error } = await supabaseClient
    .from("events")
    .select("*")
    .order("event_date", { ascending: true });
  if (error) { reportDbError("calendrier", error); return []; }
  return data;
}

async function insertEvent(title, eventDate, note) {
  if (!supabaseClient || !currentUser) return null;
  const { data, error } = await supabaseClient
    .from("events")
    .insert({ user_id: currentUser.id, title, event_date: eventDate, note: note || null })
    .select()
    .single();
  if (error) { reportDbError("ajout événement", error); return null; }
  return data;
}

async function deleteEvent(id) {
  if (!supabaseClient || !currentUser) return;
  const { error } = await supabaseClient.from("events").delete().eq("id", id);
  if (error) reportDbError("suppression événement", error);
}

// ===================== Favoris (données) =====================
// kind: "weather" | "stock" | "transit". payload : détails propres à chaque type.
async function fetchFavorites(kind) {
  if (!supabaseClient || !currentUser) return [];
  const { data, error } = await supabaseClient
    .from("favorites")
    .select("*")
    .eq("kind", kind)
    .order("created_at", { ascending: false });
  if (error) { reportDbError("favoris", error); return []; }
  return data;
}

async function addFavoriteDb(kind, label, payload) {
  if (!supabaseClient || !currentUser) return null;
  const { data, error } = await supabaseClient
    .from("favorites")
    .upsert(
      { user_id: currentUser.id, kind, label, payload: payload || {} },
      { onConflict: "user_id,kind,label", ignoreDuplicates: true }
    )
    .select();
  if (error) { reportDbError("ajout favori", error); return null; }
  return data;
}

async function removeFavoriteDb(id) {
  if (!supabaseClient || !currentUser) return;
  const { error } = await supabaseClient.from("favorites").delete().eq("id", id);
  if (error) reportDbError("suppression favori", error);
}

// ===================== Tâches =====================
const taskForm = document.getElementById("task-form");
if (taskForm) {
  taskForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!supabaseClient || !currentUser) return;
    const title = document.getElementById("task-title").value.trim();
    const dueDate = document.getElementById("task-due-date").value || null;
    const priority = document.getElementById("task-priority").value;

    const { error } = await supabaseClient.from("tasks").insert({
      user_id: currentUser.id,
      title,
      due_date: dueDate,
      priority,
    });
    if (error) { reportDbError("ajout tâche", error); return; }

    taskForm.reset();
    document.getElementById("task-priority").value = "normal";
    loadTasks();
  });
}

async function toggleTaskDone(id, done) {
  if (!supabaseClient || !currentUser) return;
  const { error } = await supabaseClient.from("tasks").update({ done }).eq("id", id);
  if (error) reportDbError("mise à jour tâche", error);
}

async function loadTasks() {
  const box = document.getElementById("tasks-box");
  if (!supabaseClient || !currentUser) return;
  box.textContent = "Chargement…";

  const { data, error } = await supabaseClient
    .from("tasks")
    .select("*")
    .order("done", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    reportDbError("chargement tâches", error);
    box.textContent = "Erreur de chargement des tâches.";
    return;
  }
  if (!data.length) {
    box.textContent = "Aucune tâche pour l'instant.";
    return;
  }

  const priorityIcon = { low: "🔵", normal: "🟡", high: "🔴" };
  box.innerHTML = data
    .map((row) => {
      const due = row.due_date
        ? new Date(row.due_date + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
        : "";
      return `<div class="list-row task-row ${row.done ? "task-done" : ""}">
        <label class="task-label">
          <input type="checkbox" class="task-checkbox" data-id="${row.id}" ${row.done ? "checked" : ""}>
          <span>${priorityIcon[row.priority] || ""} ${row.title}</span>
          ${due ? `<span class="list-row-date">📅 ${due}</span>` : ""}
        </label>
        <button class="delete-btn" data-id="${row.id}" data-kind="tasks" title="Supprimer">🗑️</button>
      </div>`;
    })
    .join("");

  box.querySelectorAll(".task-checkbox").forEach((cb) => {
    cb.addEventListener("change", async () => {
      await toggleTaskDone(cb.dataset.id, cb.checked);
      loadTasks();
    });
  });

  attachDeleteHandlers();
}

// ===================== Notes =====================
const noteForm = document.getElementById("note-form");
if (noteForm) {
  noteForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!supabaseClient || !currentUser) return;
    const content = document.getElementById("note-content").value.trim();

    const { error } = await supabaseClient.from("notes").insert({
      user_id: currentUser.id,
      content,
    });
    if (error) { reportDbError("ajout note", error); return; }

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
    reportDbError("chargement notes", error);
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

// ---------- Suppression générique (notes, et réutilisable ailleurs) ----------
function attachDeleteHandlers() {
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { id, kind } = btn.dataset;
      await supabaseClient.from(kind).delete().eq("id", id);
      if (kind === "notes") loadNotes();
      if (kind === "tasks") loadTasks();
      document.dispatchEvent(new CustomEvent("db-deleted", { detail: { kind, id } }));
    });
  });
}

// ===================== Profil / réglages (données) =====================
async function fetchProfile() {
  if (!supabaseClient || !currentUser) return null;
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("user_id", currentUser.id)
    .maybeSingle();
  if (error) { reportDbError("profil", error); return null; }
  return data;
}

async function saveProfile(settings) {
  if (!supabaseClient || !currentUser) return null;
  const { data, error } = await supabaseClient
    .from("profiles")
    .upsert({ user_id: currentUser.id, ...settings, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) { reportDbError("enregistrement du profil", error); return null; }
  return data;
}
