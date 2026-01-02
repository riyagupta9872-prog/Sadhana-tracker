alert("JS LOADED");// ================= FIREBASE CONFIG (REAL, WORKING) =================
const firebaseConfig = {
  apiKey: "AIzaSyDbRy8ZMJAWeTyZVnTphwRIei6jAckagjA",
  authDomain: "sadhana-tracker-b65ff.firebaseapp.com",
  projectId: "sadhana-tracker-b65ff",
  storageBucket: "sadhana-tracker-b65ff.appspot.com",
  messagingSenderId: "926961218888",
  appId: "1:926961218888:web:db8f12ef8256d13f036f7d"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ================= STATE =================
let currentUser = null;
let userProfile = null;

// ================= VIEWS =================
const views = {
  auth: document.getElementById("auth-section"),
  profile: document.getElementById("profile-section"),
  dashboard: document.getElementById("dashboard-section")
};

function showView(name) {
  Object.values(views).forEach(v => v.classList.add("hidden"));
  if (views[name]) views[name].classList.remove("hidden");
}

// ================= AUTH STATE =================
auth.onAuthStateChanged(async user => {
  currentUser = user;

  if (!user) {
    showView("auth");
    return;
  }

  const snap = await db.collection("users").doc(user.uid).get();
  if (!snap.exists) {
    showView("profile");
    return;
  }

  userProfile = snap.data();
  initializeApp();
});

// ================= INITIALIZE =================
function initializeApp() {
  document.getElementById("user-display-name").textContent = userProfile.name;

  if (userProfile.role === "admin") {
    document.getElementById("admin-tab-btn").classList.remove("hidden");
    loadAdminData();
  }

  setupDateSelect();
  showView("dashboard");
  loadReports();
}

// ================= LOGIN =================
document.getElementById("login-form").addEventListener("submit", e => {
  e.preventDefault();
  auth
    .signInWithEmailAndPassword(
      document.getElementById("login-email").value,
      document.getElementById("login-password").value
    )
    .catch(err => {
      document.getElementById("auth-error").innerText = err.message;
    });
});

// ================= LOGOUT =================
document.getElementById("logout-btn").addEventListener("click", () => {
  auth.signOut();
});

// ================= PROFILE =================
document.getElementById("profile-form").addEventListener("submit", async e => {
  e.preventDefault();

  const data = {
    name: document.getElementById("profile-name").value,
    chantingCategory: document.getElementById("profile-chanting").value,
    email: currentUser.email,
    role: "user",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  await db.collection("users").doc(currentUser.uid).set(data);
  userProfile = data;
  initializeApp();
});

// ================= DATE SELECT =================
function setupDateSelect() {
  const sel = document.getElementById("sadhana-date");
  sel.innerHTML = "";
  const today = new Date();

  for (let i = 0; i < 3; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().split("T")[0];
    const opt = document.createElement("option");
    opt.value = iso;
    opt.textContent = iso;
    sel.appendChild(opt);
  }
}

// ================= SADHANA =================
document.getElementById("sadhana-form").addEventListener("submit", async e => {
  e.preventDefault();

  const date = document.getElementById("sadhana-date").value;

  const entry = {
    sleepTime: sleepTime.value,
    wakeupTime: wakeupTime.value,
    chantingTime: chantingTime.value,
    readingMinutes: +readingMinutes.value,
    hearingMinutes: +hearingMinutes.value,
    daySleepMinutes: +daySleepMinutes.value,
    submittedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  entry.scores = calculateScores(entry);
  entry.totalScore = Object.values(entry.scores).reduce((a, b) => a + b, 0);

  await db
    .collection("users")
    .doc(currentUser.uid)
    .collection("sadhana")
    .doc(date)
    .set(entry);

  document.getElementById("sadhana-message").innerText =
    "Sadhana submitted successfully";
  document.getElementById("sadhana-form").reset();
  setupDateSelect();
  loadReports();
});

// ================= SCORING =================
function mins(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function calculateScores(d) {
  const s = {};

  const sl = mins(d.sleepTime);
  if (sl <= mins("22:30")) s.sleep = 25;
  else if (sl <= mins("22:35")) s.sleep = 20;
  else if (sl <= mins("22:40")) s.sleep = 15;
  else if (sl <= mins("22:45")) s.sleep = 10;
  else if (sl <= mins("22:50")) s.sleep = 5;
  else if (sl <= mins("22:55")) s.sleep = 0;
  else s.sleep = -5;

  const w = mins(d.wakeupTime);
  if (w <= mins("05:05")) s.wakeup = 25;
  else if (w <= mins("05:10")) s.wakeup = 20;
  else if (w <= mins("05:15")) s.wakeup = 15;
  else if (w <= mins("05:20")) s.wakeup = 10;
  else if (w <= mins("05:25")) s.wakeup = 5;
  else if (w <= mins("05:30")) s.wakeup = 0;
  else s.wakeup = -5;

  const c = mins(d.chantingTime);
  if (c <= mins("09:00")) s.chanting = 25;
  else if (c <= mins("09:30")) s.chanting = 20;
  else if (c <= mins("11:00")) s.chanting = 15;
  else if (c <= mins("14:30")) s.chanting = 10;
  else if (c <= mins("17:00")) s.chanting = 5;
  else if (c <= mins("19:00")) s.chanting = 0;
  else s.chanting = -5;

  s.daySleep = d.daySleepMinutes <= 60 ? 25 : -5;

  const r = d.readingMinutes;
  s.reading = r >= 30 ? 25 : r >= 25 ? 20 : r >= 20 ? 15 : r >= 15 ? 10 : r >= 10 ? 5 : r >= 5 ? 0 : -5;

  const h = d.hearingMinutes;
  s.hearing = h >= 30 ? 25 : h >= 25 ? 20 : h >= 20 ? 15 : h >= 15 ? 10 : h >= 10 ? 5 : h >= 5 ? 0 : -5;

  return s;
}

// ================= REPORTS =================
async function loadReports() {
  const box = document.getElementById("weekly-reports-container");
  box.innerHTML = "";

  const snap = await db
    .collection("users")
    .doc(currentUser.uid)
    .collection("sadhana")
    .orderBy("submittedAt", "desc")
    .limit(30)
    .get();

  const weeks = {};
  snap.forEach(doc => {
    const d = new Date(doc.id);
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const k = monday.toISOString().split("T")[0];
    if (!weeks[k]) weeks[k] = [];
    weeks[k].push({ date: doc.id, ...doc.data() });
  });

  Object.keys(weeks)
    .sort()
    .reverse()
    .forEach((w, i) => {
      const total = weeks[w].reduce((a, x) => a + x.totalScore, 0);
      const div = document.createElement("div");
      div.className = "week-summary";
      div.innerHTML = `
        <div class="week-header ${total < 20 ? "low-score" : ""}" onclick="toggleWeek(this)">
          <span>Week of ${w}</span>
          <span>Total ${total}</span>
        </div>
        <div class="week-details ${i === 0 ? "expanded" : ""}">
          ${weeks[w]
            .map(
              e =>
                `<div class="daily-entry">
                  <span>${e.date}</span>
                  <span class="${e.totalScore < 0 ? "score-negative" : ""}">${e.totalScore}</span>
                  <span>Sleep ${e.sleepTime} / Wake ${e.wakeupTime}</span>
                </div>`
            )
            .join("")}
        </div>`;
      box.appendChild(div);
    });
}

// ================= ADMIN =================
async function loadAdminData() {
  const list = document.getElementById("admin-users-list");
  list.innerHTML = "";
  const snap = await db.collection("users").get();
  snap.forEach(d => {
    const u = d.data();
    const el = document.createElement("div");
    el.className = "admin-user-card";
    el.innerHTML = `<b>${u.name}</b><br>${u.email}<br>${u.chantingCategory}`;
    list.appendChild(el);
  });
}

// ================= UTILS =================
window.switchTab = tab => {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  document.getElementById(tab + "-tab").classList.add("active");
};

window.toggleWeek = h => h.nextElementSibling.classList.toggle("expanded");