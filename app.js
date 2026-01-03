// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDbRy8ZMJAWeTyZVnTphwRIei6jAckagjA",
  authDomain: "sadhana-tracker-b65ff.firebaseapp.com",
  projectId: "sadhana-tracker-b65ff",
  storageBucket: "sadhana-tracker-b65ff.firebasestorage.app",
  messagingSenderId: "926961218888",
  appId: "1:926961218888:web:db8f12ef8256d13f036f7d"
};

// Initialize Firebase
try {
    firebase.initializeApp(firebaseConfig);
} catch (e) {
    console.error("Firebase Init Error:", e);
}

const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let userProfile = null;
let activeListeners = []; // To prevent memory leaks

const views = {
    auth: document.getElementById('auth-section'),
    profile: document.getElementById('profile-section'),
    dashboard: document.getElementById('dashboard-section')
};

// --- Utility Functions ---

function showMessage(elementId, msg, type = 'success') {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = msg;
    el.className = `message ${type}`;
    el.classList.remove('hidden');
    if (type === 'success') {
        setTimeout(() => el.classList.add('hidden'), 3000);
    }
}

function showView(viewName) {
    Object.values(views).forEach(el => { if(el) el.classList.add('hidden'); });
    if (viewName && views[viewName]) views[viewName].classList.remove('hidden');
}

function getWeekRangeInfo(dateInput) {
    const d = new Date(dateInput);
    const day = d.getDay(); 
    const sun = new Date(d);
    sun.setDate(d.getDate() - day);
    const sat = new Date(sun);
    sat.setDate(sun.getDate() + 6);
    const options = { day: '2-digit', month: 'short' };
    return {
        sundayStr: sun.toISOString().split('T')[0],
        saturdayStr: sat.toISOString().split('T')[0],
        displayRange: `(${sun.toLocaleDateString('en-GB', options)} - ${sat.toLocaleDateString('en-GB', options)})`
    };
}

// --- Auth State ---

auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    if (user) {
        const profileDoc = await db.collection('users').doc(user.uid).get();
        if (profileDoc.exists) {
            userProfile = profileDoc.data();
            initializeApp(userProfile);
        } else {
            showView('profile');
        }
    } else {
        showView('auth');
        activeListeners.forEach(unsub => unsub()); // Clear listeners on logout
    }
});

function initializeApp(profile) {
    document.getElementById('user-display-name').textContent = profile.name;
    setupDateSelect();
    const adminBtn = document.getElementById('admin-tab-btn');
    if (adminBtn) {
        profile.role === 'admin' ? adminBtn.classList.remove('hidden') : adminBtn.classList.add('hidden');
    }
    showView('dashboard');
    switchTab('sadhana');
}

// --- Login / Profile ---

document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value)
        .catch(err => showMessage('auth-error', err.message, 'error'));
});

document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());

// --- Sadhana Submission & Scoring ---

function setupDateSelect() {
    const select = document.getElementById('sadhana-date');
    select.innerHTML = '';
    for (let i = 0; i < 3; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const opt = document.createElement('option');
        opt.value = dateStr; opt.textContent = dateStr;
        select.appendChild(opt);
    }
}

function getMins(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }

function calculateScores(data) {
    const s = (val, target, step) => {
        let diff = getMins(val) - getMins(target);
        if (diff <= 0) return 25;
        if (diff <= step * 5) return 25 - (Math.ceil(diff/step) * 5);
        return -5;
    };
    return {
        sleep: s(data.sleepTime, "22:30", 5),
        wakeup: s(data.wakeupTime, "05:05", 5),
        chanting: s(data.chantingTime, "09:00", 30), // Example step
        daySleep: data.daySleepMinutes <= 60 ? 25 : -5,
        reading: data.readingMinutes >= 30 ? 25 : (Math.floor(data.readingMinutes/5)*5),
        hearing: data.hearingMinutes >= 30 ? 25 : (Math.floor(data.hearingMinutes/5)*5)
    };
}

document.getElementById('sadhana-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = document.getElementById('sadhana-date').value;
    const entry = {
        sleepTime: document.getElementById('sleep-time').value,
        wakeupTime: document.getElementById('wakeup-time').value,
        chantingTime: document.getElementById('chanting-time').value,
        readingMinutes: parseInt(document.getElementById('reading-minutes').value),
        hearingMinutes: parseInt(document.getElementById('hearing-minutes').value),
        daySleepMinutes: parseInt(document.getElementById('day-sleep-minutes').value),
        submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    entry.scores = calculateScores(entry);
    entry.totalScore = Object.values(entry.scores).reduce((a, b) => a + b, 0);

    await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(date).set(entry);
    showMessage('sadhana-message', "Submitted! Check the Reports tab.");
    document.getElementById('sadhana-form').reset();
});

// --- REAL-TIME REPORTS (The Visibility Fix) ---

function loadReports(userId, containerId) {
    const container = document.getElementById(containerId);
    // Real-time listener: this "watches" the database
    const unsub = db.collection('users').doc(userId).collection('sadhana')
        .onSnapshot((snapshot) => {
            const entries = snapshot.docs.map(doc => ({ date: doc.id, ...doc.data() }));
            const weeks = {};
            entries.forEach(e => {
                const info = getWeekRangeInfo(e.date);
                if (!weeks[info.sundayStr]) weeks[info.sundayStr] = { label: info.displayRange, data: [], total: 0 };
                weeks[info.sundayStr].data.push(e);
                weeks[info.sundayStr].total += (e.totalScore || 0);
            });

            container.innerHTML = '';
            Object.keys(weeks).sort((a,b) => b.localeCompare(a)).forEach(wKey => {
                const week = weeks[wKey];
                container.innerHTML += `
                    <div class="week-summary">
                        <div class="week-header" onclick="toggleWeek(this)">
                            <span>Week ${week.label}</span> <span>Total: ${week.total}</span>
                        </div>
                        <div class="week-details expanded">
                            ${week.data.map(e => `<div class="daily-entry"><strong>${e.date}</strong>: Score ${e.totalScore}</div>`).join('')}
                        </div>
                    </div>`;
            });
        });
    activeListeners.push(unsub);
}

// --- ADMIN TABLE (The Centered Request) ---

async function loadAdminComparativeTable() {
    const container = document.getElementById('admin-comparative-reports-container');
    const weeks = [];
    for (let i = 0; i < 4; i++) {
        const d = new Date(); d.setDate(d.getDate() - (i * 7));
        weeks.push(getWeekRangeInfo(d));
    }
    weeks.reverse();

    const usersSnap = await db.collection('users').get();
    let tableHtml = `<table style="width:100%; border-collapse: collapse; text-align: center;">
        <thead><tr style="background:#eee;"><th>Name</th>${weeks.map(w => `<th>Week<br>(${w.displayRange})</th>`).join('')}</tr></thead><tbody>`;

    for (const uDoc of usersSnap.docs) {
        const u = uDoc.data();
        tableHtml += `<tr><td>${u.name}</td>`;
        const sSnap = await db.collection('users').doc(uDoc.id).collection('sadhana').get();
        const sData = sSnap.docs.map(d => ({date: d.id, score: d.data().totalScore || 0}));
        
        weeks.forEach(w => {
            const total = sData.filter(s => s.date >= w.sundayStr && s.date <= w.saturdayStr).reduce((a,b) => a + b.score, 0);
            tableHtml += `<td>${total}</td>`;
        });
        tableHtml += `</tr>`;
    }
    container.innerHTML = tableHtml + `</tbody></table>`;
}

// --- Tab Switching ---

window.switchTab = function(tabName) {
    document.querySelectorAll('.tab-content, .tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabName + '-tab').classList.add('active');
    
    if (tabName === 'reports') loadReports(currentUser.uid, 'weekly-reports-container');
    if (tabName === 'admin' && userProfile.role === 'admin') loadAdminComparativeTable();
};

window.toggleWeek = (h) => h.nextElementSibling.classList.toggle('expanded');
