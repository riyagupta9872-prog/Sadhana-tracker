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
const auth = firebase.auth(), db = firebase.firestore();
let currentUser = null, userProfile = null;

// --- 1. AUTH & DASHBOARD INITIALIZATION ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        try {
            const doc = await db.collection('users').doc(user.uid).get();
            if (doc.exists) {
                userProfile = doc.data();
                // Matching your HTML IDs: user-display-name and user-display-level
                document.getElementById('user-display-name').textContent = userProfile.name;
                document.getElementById('user-display-level').textContent = userProfile.chantingCategory;
                
                if (userProfile.role === 'admin') {
                    document.getElementById('admin-tab-btn').classList.remove('hidden');
                }
                
                showSection('dashboard');
                setupDateSelect();
                switchTab('sadhana');
            } else {
                showSection('profile');
            }
        } catch (e) {
            console.error(e);
            showSection('auth');
        }
    } else {
        showSection('auth');
    }
});

// --- 2. NAVIGATION LOGIC ---
window.switchTab = (tabId) => {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    const target = document.getElementById(tabId + '-tab');
    if (target) target.classList.remove('hidden');
    
    const btn = document.querySelector(`button[onclick*="switchTab('${tabId}')"]`);
    if (btn) btn.classList.add('active');

    if (tabId === 'reports') loadReports(currentUser.uid, 'weekly-accordion-container', true);
    if (tabId === 'admin') loadAdminPanel();
};

function showSection(id) {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('profile-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.add('hidden');
    document.getElementById(id + '-section').classList.remove('hidden');
}

// --- 3. SCORING ENGINE ---
const getBaseScore = (cat) => (cat.includes('Level-3') || cat.includes('Level-4')) ? 160 : 135;

function calculateMarks(data) {
    const getM = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const s = {};
    const sl = getM(data.sleepTime);
    const sleepCutoff = getM("22:30");
    if (sl >= 0 && sl <= 300) s.sleep = -5;
    else s.sleep = sl <= sleepCutoff ? 25 : Math.max(-5, 25 - (Math.ceil((sl - sleepCutoff)/5)*5));

    const wk = getM(data.wakeupTime);
    const wakeCutoff = getM("05:05");
    s.wakeup = wk <= wakeCutoff ? 25 : Math.max(-5, 25 - (Math.ceil((wk - wakeCutoff)/5)*5));

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

// --- 4. FORM LOGIC ---
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

document.getElementById('sadhana-form').onsubmit = async (e) => {
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
    alert("Sadhana Submitted!");
    location.reload();
};

// --- 5. REPORTS & ADMIN LOGIC ---
async function loadReports(userId, containerId, limit4 = true) {
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
    const sorted = Object.keys(weeks).sort((a,b) => b.localeCompare(a));
    (limit4 ? sorted.slice(0, 4) : sorted).forEach(k => {
        const w = weeks[k];
        const div = document.createElement('div'); div.className = 'week-box';
        div.innerHTML = `<div class="week-header" onclick="this.nextElementSibling.classList.toggle('active')"><span>Week: ${w.label}</span><span>▼</span></div>
        <div class="week-content"><table class="report-table"><thead><tr><th>Date</th><th>Bed</th><th>Wake</th><th>Score</th><th>%</th></tr></thead>
        <tbody>${w.data.map(e => `<tr><td>${e.id}</td><td>${e.sleepTime}</td><td>${e.wakeupTime}</td><td>${e.totalScore}</td><td>${e.dayPercent}%</td></tr>`).join('')}</tbody></table></div>`;
        container.appendChild(div);
    });
}

async function loadAdminPanel() {
    const compContainer = document.getElementById('admin-comparative-container');
    const uList = document.getElementById('admin-users-list');
    const users = await db.collection('users').get();
    
    const weeks = []; for(let i=0; i<4; i++) { 
        const d = new Date(); d.setDate(d.getDate()-(i*7)); 
        const sun = new Date(d); sun.setDate(d.getDate()-d.getDay()); 
        weeks.push({sun: sun.toISOString().split('T')[0]}); 
    }
    weeks.reverse();

    let html = `<table class="report-table"><thead><tr><th>User</th>${weeks.map(w => `<th>${w.sun}</th>`).join('')}</tr></thead><tbody>`;
    uList.innerHTML = '';

    for (const uDoc of users.docs) {
        const u = uDoc.data();
        html += `<tr><td>${u.name}</td>`;
        const sSnap = await uDoc.ref.collection('sadhana').get();
        const entries = sSnap.docs.map(d => ({date: d.id, score: d.data().totalScore}));
        
        weeks.forEach(w => {
            let total = 0; let cur = new Date(w.sun);
            for(let i=0; i<7; i++){
                const ds = cur.toISOString().split('T')[0];
                const f = entries.find(e => e.date === ds);
                total += f ? f.score : -30;
                cur.setDate(cur.getDate()+1);
            }
            html += `<td>${total}</td>`;
        });
        html += `</tr>`;

        const div = document.createElement('div'); div.style="display:flex;justify-content:space-between;padding:10px;border-bottom:1px solid #eee";
        div.innerHTML = `<span>${u.name}</span><button onclick="openUserModal('${uDoc.id}', '${u.name}')" style="width:auto">Detail Table</button>`;
        uList.appendChild(div);
    }
    compContainer.innerHTML = html + `</tbody></table>`;
}

// --- 6. EXPORTS & HELPERS ---
document.getElementById('login-form').onsubmit = (e) => {
    e.preventDefault();
    auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value)
    .catch(err => alert(err.message));
};

document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        name: document.getElementById('profile-name').value,
        chantingCategory: document.getElementById('profile-chanting').value,
        exactRounds: document.getElementById('profile-exact-rounds').value,
        role: 'user', email: currentUser.email
    };
    await db.collection('users').doc(currentUser.uid).set(data);
    location.reload();
};

document.getElementById('logout-btn').onclick = () => auth.signOut();
window.openUserModal = (id, name) => { document.getElementById('user-report-modal').classList.remove('hidden'); document.getElementById('modal-user-name').textContent = name; loadReports(id, 'modal-report-container', true); };
window.closeUserModal = () => document.getElementById('user-report-modal').classList.add('hidden');
