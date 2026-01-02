// REPLACE THIS CONFIG WITH YOUR ACTUAL KEYS
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "sadhana-tracker-b65ff.firebaseapp.com",
    projectId: "sadhana-tracker-b65ff",
    storageBucket: "sadhana-tracker-b65ff.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let userProfile = null;

// --- AUTH STATE ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const profileDoc = await db.collection('users').doc(user.uid).get();
        if (profileDoc.exists) {
            userProfile = profileDoc.data();
            initDashboard();
        } else {
            showView('profile-section');
        }
    } else {
        showView('auth-section');
    }
});

function showView(id) {
    ['auth-section', 'profile-section', 'dashboard-section'].forEach(vid => {
        document.getElementById(vid).classList.add('hidden');
    });
    document.getElementById(id).classList.remove('hidden');
}

// --- PROFILE SETUP ---
document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        name: document.getElementById('profile-name').value,
        chantingCategory: document.getElementById('profile-chanting').value,
        email: currentUser.email,
        role: (currentUser.email === 'riyagupta9872@gmail.com') ? 'admin' : 'user', // Initial admin check
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('users').doc(currentUser.uid).set(data);
    userProfile = data;
    initDashboard();
});

// --- DASHBOARD INIT ---
function initDashboard() {
    document.getElementById('user-display-name').textContent = userProfile.name;
    if (userProfile.role === 'admin') document.getElementById('admin-tab-btn').classList.remove('hidden');
    setupDateSelect();
    loadReports();
    showView('dashboard-section');
}

function setupDateSelect() {
    const select = document.getElementById('sadhana-date');
    select.innerHTML = '';
    const labels = ['Today', 'Yesterday', 'Day Before Yesterday'];
    for (let i = 0; i < 3; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const iso = d.toISOString().split('T')[0];
        select.innerHTML += `<option value="${iso}">${labels[i]} (${iso})</option>`;
    }
}

// --- SCORING ENGINE ---
function calculateScores(d) {
    const getMins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const s = {};

    // Sleep (10:30 PM = 1350 mins)
    const sl = getMins(d.sleepTime);
    if (sl <= 1350) s.sleep = 25;
    else if (sl <= 1355) s.sleep = 20;
    else if (sl <= 1360) s.sleep = 15;
    else if (sl <= 1365) s.sleep = 10;
    else if (sl <= 1370) s.sleep = 5;
    else if (sl <= 1375) s.sleep = 0;
    else s.sleep = -5;

    // Wake (05:05 AM = 305 mins)
    const wk = getMins(d.wakeupTime);
    if (wk <= 305) s.wakeup = 25;
    else if (wk <= 310) s.wakeup = 20;
    else if (wk <= 315) s.wakeup = 15;
    else if (wk <= 320) s.wakeup = 10;
    else if (wk <= 325) s.wakeup = 5;
    else if (wk <= 330) s.wakeup = 0;
    else s.wakeup = -5;

    // Chanting (09:00 AM = 540)
    const ch = getMins(d.chantingTime);
    if (ch <= 540) s.chanting = 25;
    else if (ch <= 570) s.chanting = 20;
    else if (ch <= 660) s.chanting = 15;
    else if (ch <= 870) s.chanting = 10;
    else if (ch <= 1020) s.chanting = 5;
    else if (ch <= 1140) s.chanting = 0;
    else s.chanting = -5;

    s.daySleep = d.daySleepMinutes <= 60 ? 25 : -5;
    
    const scoreVal = (val) => {
        if (val >= 30) return 25;
        if (val >= 25) return 20;
        if (val >= 20) return 15;
        if (val >= 15) return 10;
        if (val >= 10) return 5;
        if (val >= 5) return 0;
        return -5;
    };
    s.reading = scoreVal(d.readingMinutes);
    s.hearing = scoreVal(d.hearingMinutes);

    return s;
}

// --- SUBMISSION ---
document.getElementById('sadhana-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = document.getElementById('sadhana-date').value;
    const entry = {
        sleepTime: document.getElementById('sleep-time').value,
        wakeupTime: document.getElementById('wakeup-time').value,
        chantingTime: document.getElementById('chanting-time').value,
        readingMinutes: parseInt(document.getElementById('reading-minutes').value),
        hearingMinutes: parseInt(document.getElementById('hearing-minutes').value),
        daySleepMinutes: parseInt(document.getElementById('day-sleep-minutes').value)
    };
    entry.scores = calculateScores(entry);
    entry.totalScore = Object.values(entry.scores).reduce((a, b) => a + b, 0);
    
    await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(date).set(entry);
    document.getElementById('sadhana-message').textContent = "Saved!";
    document.getElementById('sadhana-form').reset();
    loadReports();
});

// --- REPORTS (With NR Logic) ---
async function loadReports() {
    const container = document.getElementById('weekly-reports-container');
    container.innerHTML = 'Loading...';
    
    const snap = await db.collection('users').doc(currentUser.uid).collection('sadhana').get();
    const entries = {};
    snap.forEach(doc => entries[doc.id] = doc.data());

    // Generate last 7 days including NR
    let html = '';
    let weekTotal = 0;
    let weekRows = '';

    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const iso = d.toISOString().split('T')[0];
        
        if (entries[iso]) {
            const e = entries[iso];
            weekTotal += e.totalScore;
            weekRows += `<div class="daily-entry"><span>${iso}</span><span>Score: ${e.totalScore}</span><span>Done</span></div>`;
        } else if (i > 0) { // Don't mark today as NR until tomorrow
            weekTotal -= 30; // -5 * 6 categories
            weekRows += `<div class="daily-entry nr-entry"><span>${iso}</span><span>Score: -30</span><span>NR</span></div>`;
        }
    }

    const isLow = weekTotal < 20;
    html = `<div class="week-summary">
        <div class="week-header ${isLow ? 'low-score' : ''}" onclick="this.nextElementSibling.classList.toggle('expanded')">
            <span>Last 7 Days</span><span>Total: ${weekTotal}</span>
        </div>
        <div class="week-details expanded">${weekRows}</div>
    </div>`;
    
    container.innerHTML = html;
}

// --- ADMIN ---
async function loadAdminData() {
    const list = document.getElementById('admin-users-list');
    const users = await db.collection('users').get();
    list.innerHTML = '';
    users.forEach(u => {
        const ud = u.data();
        list.innerHTML += `<div class="admin-user-card"><strong>${ud.name}</strong> - ${ud.chantingCategory} rounds</div>`;
    });
}

// --- TABS ---
window.switchTab = (name) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('btn-' + name).classList.add('active');
    document.getElementById(name + '-tab').classList.add('active');
    if (name === 'admin') loadAdminData();
};

document.getElementById('logout-btn').onclick = () => auth.signOut().then(() => location.reload());
document.getElementById('login-form').onsubmit = (e) => {
    e.preventDefault();
    auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value);
};
