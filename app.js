// ================= FIREBASE CONFIG =================
const firebaseConfig = {
  apiKey: "AIzaSyDbRy8ZMJAWeTyZVnTphwRIei6jAckagjA",
  authDomain: "sadhana-tracker-b65ff.firebaseapp.com",
  projectId: "sadhana-tracker-b65ff",
  storageBucket: "sadhana-tracker-b65ff.appspot.com",
  messagingSenderId: "926961218888",
  appId: "1:926961218888:web:db8f12ef8256d13f036f7d"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

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
      document.getElementById("auth-error").textContent = err.message;
    });
});

document.getElementById("logout-btn").addEventListener("click", () => {
  auth.signOut();
  location.reload();
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
  const select = document.getElementById("sadhana-date");
  select.innerHTML = "";

  const today = new Date();
  for (let i = 0; i < 3; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const id = d.toISOString().split("T")[0];
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent =
      i === 0 ? "Today" : i === 1 ? "Yesterday" : "Day Before Yesterday";
    select.appendChild(opt);
  }
}

// ================= SADHANA SUBMIT =================
document.getElementById("sadhana-form").addEventListener("submit", async e => {
  e.preventDefault();

  const date = document.getElementById("sadhana-date").value;

  const entry = {
    sleepTime: document.getElementById("sleep-time").value,
    wakeupTime: document.getElementById("wakeup-time").value,
    chantingTime: document.getElementById("chanting-time").value,
    readingMinutes: Number(document.getElementById("reading-minutes").value),
    hearingMinutes: Number(document.getElementById("hearing-minutes").value),
    daySleepMinutes: Number(document.getElementById("day-sleep-minutes").value),
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

  document.getElementById("sadhana-message").textContent =
    "Sadhana submitted successfully";
  setTimeout(() => (document.getElementById("sadhana-message").textContent = ""), 2000);

  loadReports();
});

// ================= SCORING (UNCHANGED) =================
function calculateScores(d) {
  const t = x => {
    const [h, m] = x.split(":").map(Number);
    return h * 60 + m;
  };

  let s = {};

  const sleep = t(d.sleepTime);
  s.sleep =
    sleep <= t("22:30") ? 25 :
    sleep <= t("22:35") ? 20 :
    sleep <= t("22:40") ? 15 :
    sleep <= t("22:45") ? 10 :
    sleep <= t("22:50") ? 5 :
    sleep <= t("22:55") ? 0 : -5;

  const wake = t(d.wakeupTime);
  s.wakeup =
    wake <= t("05:05") ? 25 :
    wake <= t("05:10") ? 20 :
    wake <= t("05:15") ? 15 :
    wake <= t("05:20") ? 10 :
    wake <= t("05:25") ? 5 :
    wake <= t("05:30") ? 0 : -5;

  const chant = t(d.chantingTime);
  s.chanting =
    chant <= t("09:00") ? 25 :
    chant <= t("09:30") ? 20 :
    chant <= t("11:00") ? 15 :
    chant <= t("14:30") ? 10 :
    chant <= t("17:00") ? 5 :
    chant <= t("19:00") ? 0 : -5;

  s.daySleep = d.daySleepMinutes <= 60 ? 25 : -5;

  const r = d.readingMinutes;
  s.reading = r >= 30 ? 25 : r >= 25 ? 20 : r >= 20 ? 15 : r >= 15 ? 10 : r >= 10 ? 5 : r >= 5 ? 0 : -5;

  const h = d.hearingMinutes;
  s.hearing = h >= 30 ? 25 : h >= 25 ? 20 : h >= 20 ? 15 : h >= 15 ? 10 : h >= 10 ? 5 : h >= 5 ? 0 : -5;

  return s;
}

// ================= REPORTS (FIXED) =================
async function loadReports() {
  const box = document.getElementById("weekly-reports-container");
  box.innerHTML = "Loading...";

  const snap = await db
    .collection("users")
    .doc(currentUser.uid)
    .collection("sadhana")
    .orderBy(firebase.firestore.FieldPath.documentId(), "desc")
    .limit(30)
    .get();

  box.innerHTML = "";
  snap.forEach(doc => {
    const d = doc.data();
    const div = document.createElement("div");
    div.textContent = `${doc.id} — Score: ${d.totalScore}`;
    box.appendChild(div);
  });
}

// ================= ADMIN =================
async function loadAdminData() {
  const box = document.getElementById("admin-users-list");
  box.innerHTML = "";

  const snap = await db.collection("users").get();
  snap.forEach(doc => {
    const u = doc.data();
    const d = document.createElement("div");
    d.className = "admin-user-card";
    d.innerHTML = `<b>${u.name}</b><br>${u.email}<br>${u.chantingCategory}`;
    box.appendChild(d);
  });
}

// ================= TABS =================
window.switchTab = name => {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  document.getElementById(name + "-tab").classList.add("active");
}; 