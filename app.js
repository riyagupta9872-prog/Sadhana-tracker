// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDbRy8ZMJAWeTyZVnTphwRIei6jAckagjA",
    authDomain: "sadhana-tracker-b65ff.firebaseapp.com",
    projectId: "sadhana-tracker-b65ff",
    storageBucket: "sadhana-tracker-b65ff.firebasestorage.app",
    messagingSenderId: "926961218888",
    appId: "1:926961218888:web:db8f12ef8256d13f036f7d"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let userProfile = null;

// --- 1. AUTH OBSERVER (The "Wake Up" Logic) ---
auth.onAuthStateChanged(async (user) => {
    const authSec = document.getElementById('auth-section');
    const profSec = document.getElementById('profile-section');
    const dashSec = document.getElementById('dashboard-section');

    if (user) {
        currentUser = user;
        authSec.classList.add('hidden');
        
        try {
            const doc = await db.collection('users').doc(user.uid).get();
            if (doc.exists) {
                userProfile = doc.data();
                // Match your HTML IDs exactly
                document.getElementById('user-display-name').textContent = userProfile.name;
                document.getElementById('user-display-level').textContent = userProfile.chantingCategory;
                
                if (userProfile.role === 'admin') {
                    document.getElementById('admin-tab-btn').classList.remove('hidden');
                }
                
                dashSec.classList.remove('hidden');
                profSec.classList.add('hidden');
                setupDateSelect();
                switchTab('sadhana');
            } else {
                profSec.classList.remove('hidden');
                dashSec.classList.add('hidden');
            }
        } catch (e) {
            console.error("Profile Error:", e);
        }
    } else {
        authSec.classList.remove('hidden');
        dashSec.classList.add('hidden');
        profSec.classList.add('hidden');
    }
});

// --- 2. LOGIN HANDLER ---
document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    
    auth.signInWithEmailAndPassword(email, pass)
        .catch(err => alert("Login Error: " + err.message));
});

// --- 3. TAB SWITCHING ---
window.switchTab = (tabId) => {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(tabId + '-tab').classList.remove('hidden');
    const activeBtn = document.querySelector(`button[onclick*="switchTab('${tabId}')"]`);
    if (activeBtn) activeBtn.classList.add('active');

    if (tabId === 'reports') loadReports(currentUser.uid, 'weekly-accordion-container');
    if (tabId === 'admin') loadAdminPanel();
};

// --- 4. SCORING (PRD COMPLIANT) ---
const getBaseScore = (cat) => (cat.includes('Level-3') || cat.includes('Level-4')) ? 160 : 135;

function calculateMarks(data) {
    const getM = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const s = {};
    const sl = getM(data.sleepTime);
    const sleepCutoff = getM("22:30");
    
    // Bedtime
    if (sl >= 0 && sl <= 300) s.sleep = -5;
    else s.sleep = sl <= sleepCutoff ? 25 : Math.max(-5, 25 - (Math.ceil((sl - sleepCutoff)/5)*5));

    // Wakeup
    const wk = getM(data.wakeupTime);
    const wakeCutoff = getM("05:05");
    s.wakeup = wk <= wakeCutoff ? 25 : Math.max(-5, 25 - (Math.ceil((wk - wakeCutoff)/5)*5));

    // Chanting
    const ch = getM(data.chantingTime);
    if (ch < getM("09:00")) s.chanting = 25;
    else if (ch <= getM("09:30")) s.chanting = 20;
    else if (ch <= getM("10:59")) s.chanting = 15;
    else if (ch <= 1140) s.chanting = 0;
    else s.chanting = -5;

    s.daySleep = data.daySleepMinutes <= 60 ? 25 : -5;
    const calcRH = (m) => (m >= 30 ? 25 : (m >= 5 ? (Math.floor(m/5)-1)*5 : -5));
    s.reading = calcRH(data.readingMinutes);
    s.hearing = calcRH(data.hearingMinutes);
    s.service = (data.serviceMinutes >= 30) ? 25 : 0;
    
    return s;
}

// --- 5. DATA HANDLING ---
function setupDateSelect() {
    const s = document.getElementById('sadhana-date');
    s.innerHTML = '';
    for(let i=0; i<2; i++) {
        const d = new Date(); d.setDate(d.getDate()-i);
        const iso = d.toISOString().split('T')[0];
        const opt = document.createElement('option'); opt.value = iso; opt.textContent = iso;
        s.appendChild(opt);
    }
    if (userProfile.chantingCategory.match(/Level-3|Level-4/)) {
        document.getElementById('service-area').classList.remove('hidden');
    }
}

document.getElementById('sadhana-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = document.getElementById('sadhana-date').value;
    const entry = {
        sleepTime: document.getElementById('sleep-time').value,
        wakeupTime: document.getElementById('wakeup-time').value,
        chantingTime: document.getElementById('chanting-time').value,
        readingMinutes: (parseInt(document.getElementById('reading-hrs').value)||0)*60 + (parseInt(document.getElementById('reading-mins').value)||0),
        hearingMinutes: (parseInt(document.getElementById('hearing-hrs').value)||0)*60 + (parseInt(document.getElementById('hearing-mins').value)||0),
        serviceMinutes: (parseInt(document.getElementById('service-hrs').value)||0)*60 + (parseInt(document.getElementById('service-mins').value)||0),
        daySleepMinutes: parseInt(document.getElementById('day-sleep-minutes').value) || 0,
        submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    entry.scores = calculateMarks(entry);
    entry.totalScore = Object.values(entry.scores).reduce((a,b) => a+b, 0);
    entry.dayPercent = ((entry.totalScore / getBaseScore(userProfile.chantingCategory)) * 100).toFixed(1);

    await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(date).set(entry);
    alert("Sadhana Saved!");
    location.reload();
});

// --- 6. REPORTS ---
async function loadReports(userId, containerId) {
    const container = document.getElementById(containerId);
    const snap = await db.collection('users').doc(userId).collection('sadhana').orderBy('submittedAt', 'desc').get();
    const weeks = {};
    
    snap.forEach(doc => {
        const d = new Date(doc.id);
        const sun = new Date(d); sun.setDate(d.getDate() - d.getDay());
        const sunStr = sun.toISOString().split('T')[0];
        if (!weeks[sunStr]) weeks[sunStr] = { label: sunStr, data: [] };
        weeks[sunStr].data.push({id: doc.id, ...doc.data()});
    });

    container.innerHTML = '';
    Object.keys(weeks).sort((a,b) => b.localeCompare(a)).slice(0,4).forEach(k => {
        const w = weeks[k];
        const div = document.createElement('div'); div.className = 'week-box';
        div.innerHTML = `<div class="week-header" onclick="this.nextElementSibling.classList.toggle('active')"><span>Week: ${w.label}</span><span>▼</span></div>
        <div class="week-content active"><table class="report-table"><thead><tr><th>Date</th><th>Score</th><th>%</th></tr></thead>
        <tbody>${w.data.map(e => `<tr><td>${e.id}</td><td>${e.totalScore}</td><td>${e.dayPercent}%</td></tr>`).join('')}</tbody></table></div>`;
        container.appendChild(div);
    });
}

// --- 7. LOGOUT ---
document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());