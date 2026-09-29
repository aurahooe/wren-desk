const SUPABASE_URL = "https://tqfocdktvjuwoiyfgesb.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZm9jZGt0dmp1d29peWZnZXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDg0NTIsImV4cCI6MjEwNTQ4NDQ1Mn0.8TW4fQCQHc4c_xTNBEwOK3lSC9HYCbkTbfXuYQB-S8g";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
const $ = (id) => document.getElementById(id);

function hourKey(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}`;
}

function fmt(ts) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function tick() {
  const now = new Date();
  $("clock").textContent = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function card(note, extra = "") {
  const name = note.wren_profiles?.display_name || note.wren_profiles?.handle || "Reader";
  return `<article class="card">
    <h3>${escapeHtml(note.title)}</h3>
    <p>${escapeHtml(note.body)}</p>
    <div class="meta">
      <span>${escapeHtml(name)}</span>
      <span>${fmt(note.created_at)}</span>
      ${extra}
    </div>
  </article>`;
}

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function loadHour() {
  const { data } = await db
    .from("wren_hours")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) {
    $("hourKey").textContent = `Hour ${data.hour_key}`;
    $("hourHeadline").textContent = data.headline;
    $("hourBlurb").textContent = data.blurb;
  } else {
    $("hourKey").textContent = `Hour ${hourKey()}`;
    $("hourHeadline").textContent = "The desk is open";
    $("hourBlurb").textContent =
      "Leave a slip. Mark it public if you want it on the board.";
  }
}

async function loadBoard() {
  const { data, error } = await db
    .from("wren_notes")
    .select("id,title,body,created_at,is_public,wren_profiles(display_name,handle)")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) {
    $("boardList").innerHTML = `<p class="quiet">${escapeHtml(error.message)}</p>`;
    return;
  }
  $("publicCount").textContent = `${data.length} public slip${data.length === 1 ? "" : "s"}`;
  $("boardList").innerHTML = data.length
    ? data.map((n) => card(n)).join("")
    : `<p class="quiet">Nothing public yet. Be the first slip on the cork.</p>`;
}

async function loadMine(user) {
  if (!user) {
    $("mineList").innerHTML = "";
    return;
  }
  const { data } = await db
    .from("wren_notes")
    .select("id,title,body,created_at,is_public")
    .eq("author_id", user.id)
    .order("created_at", { ascending: false });
  $("mineList").innerHTML = (data || [])
    .map((n) =>
      card(n, `<span class="pill">${n.is_public ? "public" : "private"}</span>`)
    )
    .join("") || `<p class="quiet">Your drawer is empty.</p>`;
}

async function currentUser() {
  const { data } = await db.auth.getUser();
  return data.user || null;
}

async function refreshSessionUi() {
  const user = await currentUser();
  const btn = $("authBtn");
  if (user) {
    btn.textContent = "Sign out";
    $("compose").hidden = false;
    $("deskHint").textContent = `Signed in as ${user.email}. Public slips appear on the board.`;
  } else {
    btn.textContent = "Sign in";
    $("compose").hidden = true;
    $("deskHint").textContent =
      "Sign in to keep slips. Email magic link. No password to remember.";
  }
  await loadMine(user);
  return user;
}

$("authBtn").addEventListener("click", async () => {
  const user = await currentUser();
  if (user) {
    await db.auth.signOut();
    await refreshSessionUi();
    return;
  }
  $("authDialog").showModal();
});

$("authCancel").addEventListener("click", () => $("authDialog").close());

$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = new FormData($("authForm")).get("email");
  $("authStatus").textContent = "Sending…";
  const { error } = await db.auth.signInWithOtp({
    email: String(email),
    options: { emailRedirectTo: window.location.origin },
  });
  $("authStatus").textContent = error
    ? error.message
    : "Check your inbox. The link opens this desk.";
});

$("compose").addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = await currentUser();
  if (!user) return;
  const form = e.currentTarget;
  const payload = {
    author_id: user.id,
    title: form.title.value.trim(),
    body: form.body.value.trim(),
    is_public: form.is_public.checked,
  };
  const { error } = await db.from("wren_notes").insert(payload);
  if (error) {
    alert(error.message);
    return;
  }
  form.reset();
  await Promise.all([loadBoard(), loadMine(user)]);
});

db.auth.onAuthStateChange(() => {
  refreshSessionUi();
});

tick();
setInterval(tick, 1000);
loadHour();
loadBoard();
refreshSessionUi();
