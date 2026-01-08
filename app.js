// --- 1. FIREBASE CONFIG ---
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

let currentUser = null, userProfile = null, activeListener = null;

// --- 2. CORE LOGIC ---
function getWeekRange(dateInput) {
    const d = new Date(dateInput);
    const day = d.getDay(); 
    const sun = new Date(d); sun.setDate(d.getDate() - day);
    const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
    const opt = { day: '2-digit', month: 'short' };
    return {
        sunStr: sun.toISOString().split('T')[0],
        label: `(${sun.toLocaleDateString('en-GB', opt)} - ${sat.toLocaleDateString('en-GB', opt)})`
    };
}

function calculateScores(data) {
    const getM = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const s = {};
    
    // Sleep logic (22:30 cutoff)
    const sl = getM(data.sleepTime);
    s.sleep = sl <= getM("22:30") ? 25 : (sl <= getM("22:55") ? 25 - (Math.ceil((sl - getM("22:30"))/5)*5) : -5);

    // Wakeup logic (05:05 cutoff)
    const wk = getM(data.wakeupTime);
    s.wakeup = wk <= getM("05:05") ? 25 : (wk <= getM("05:30") ? 25 - (Math.ceil((wk - getM("05:05"))/5)*5) : -5);

    // Chanting logic
    const ch = getM(data.chantingTime);
    s.chanting = ch <= getM("09:00") ? 25 : (ch <= getM("19:00") ? 25 - (Math.ceil((ch - getM("09:00"))/30)*5) : -5);

    s.daySleep = data.daySleepMinutes <= 60 ? 25 : -5;
    s.reading = data.readingMinutes >= 30 ? 25 : (data.readingMinutes >= 5 ? (Math.floor(data.readingMinutes/5)-1)*5 : -5);
    s.hearing = data.hearingMinutes >= 30 ? 25 : (data.hearingMinutes >= 5 ? (Math.floor(data.hearingMinutes/5)-1)*5 : -5);

    return s;
}

// --- 3. AUTH ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            document.getElementById('user-display-name').textContent = userProfile.name + " | " + (userProfile.chantingCategory || "");
            if (userProfile.role === 'admin') document.getElementById('admin-tab-btn').classList.remove('hidden');
            showView('dashboard'); switchTab('sadhana'); setupDateSelect();
        } else { showView('profile'); }
    } else { showView('auth'); }
});

function showView(v) {
    ['auth', 'profile', 'dashboard'].forEach(id => document.getElementById(id + '-section').classList.add('hidden'));
    document.getElementById(v + '-section').classList.remove('hidden');
}

// --- 4. FORM SUBMISSION ---
document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const date = document.getElementById('sadhana-date').value;
    const btn = document.getElementById('submit-btn');

    const check = await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(date).get();
    if (check.exists) {
        alert("Already submitted for this date. No edits allowed.");
        return;
    }

    btn.disabled = true;

    const readTotal = (parseInt(document.getElementById('reading-hrs').value) || 0) * 60 + (parseInt(document.getElementById('reading-mins').value) || 0);
    const hearTotal = (parseInt(document.getElementById('hearing-hrs').value) || 0) * 60 + (parseInt(document.getElementById('hearing-mins').value) || 0);
    const servTotal = (parseInt(document.getElementById('service-hrs').value) || 0) * 60 + (parseInt(document.getElementById('service-mins').value) || 0);

    const entry = {
        sleepTime: document.getElementById('sleep-time').value,
        wakeupTime: document.getElementById('wakeup-time').value,
        chantingTime: document.getElementById('chanting-time').value,
        readingMinutes: readTotal,
        hearingMinutes: hearTotal,
        serviceMinutes: servTotal,
        daySleepMinutes: parseInt(document.getElementById('day-sleep-minutes').value) || 0,
        submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    entry.scores = calculateScores(entry);
    entry.totalScore = Object.values(entry.scores).reduce((a,b) => a+b, 0);

    try {
        await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(date).set(entry);
        alert("Sadhana Submitted!");
        location.reload();
    } catch (err) { alert(err.message); btn.disabled = false; }
};

// --- 5. UTILS ---
function setupDateSelect() {
    const s = document.getElementById('sadhana-date'); s.innerHTML = '';
    for(let i=0; i<2; i++) {
        const d = new Date(); d.setDate(d.getDate()-i);
        const iso = d.toISOString().split('T')[0];
        const opt = document.createElement('option'); opt.value = iso;
        opt.textContent = i===0 ? "Today ("+iso+")" : "Yesterday ("+iso+")";
        s.appendChild(opt);
    }
    // Strict string matching for Levels
    const cat = userProfile.chantingCategory || "";
    if (cat.includes('Level-3') || cat.includes('Level-4')) {
        document.getElementById('service-area').classList.remove('hidden');
    }
}

function switchTab(t) {
    document.querySelectorAll('.tab-content, .tab-btn').forEach(el => el.classList.remove('active', 'hidden'));
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(t + '-tab').classList.remove('hidden');
    const activeBtn = document.querySelector(`.tab-btn[onclick*="${t}"]`);
    if(activeBtn) activeBtn.classList.add('active');
    
    if (t === 'reports') loadReports(currentUser.uid, 'weekly-reports-container');
    if (t === 'admin') loadAdminPanel();
}

function loadReports(userId, containerId) {
    const container = document.getElementById(containerId);
    if (activeListener) activeListener();
    activeListener = db.collection('users').doc(userId).collection('sadhana').onSnapshot(snap => {
        const entries = snap.docs.map(d => ({id: d.id, ...d.data()}));
        const weeks = {};
        entries.forEach(e => {
            const w = getWeekRange(e.id);
            if (!weeks[w.sunStr]) weeks[w.sunStr] = { label: w.label, data: [], total: 0 };
            weeks[w.sunStr].data.push(e);
            weeks[w.sunStr].total += e.totalScore;
        });
        container.innerHTML = '';
        Object.keys(weeks).sort((a,b) => b.localeCompare(a)).forEach(key => {
            const week = weeks[key];
            const div = document.createElement('div'); div.className = 'card';
            div.innerHTML = `<strong>Week ${week.label}</strong> - Total: ${week.total}<br>` + 
                week.data.map(e => `<small>${e.id}: Score ${e.totalScore}</small>`).join('<br>');
            container.appendChild(div);
        });
    });
}

// --- 6. ADMIN ---
async function loadAdminPanel() {
    const list = document.getElementById('admin-users-list'); list.innerHTML = 'Loading users...';
    const usersSnap = await db.collection('users').get();
    list.innerHTML = '';
    usersSnap.forEach(doc => {
        const u = doc.data();
        const div = document.createElement('div'); div.className = 'user-item';
        div.innerHTML = `<span>${u.name} (${u.chantingCategory})</span>
            <button onclick="openUserModal('${doc.id}', '${u.name}')" style="width:auto; padding:5px 10px;">View</button>`;
        list.appendChild(div);
    });
}

window.openUserModal = (id, name) => {
    document.getElementById('user-report-modal').classList.remove('hidden');
    document.getElementById('modal-user-name').textContent = name;
    loadReports(id, 'modal-report-container');
};
window.closeUserModal = () => document.getElementById('user-report-modal').classList.add('hidden');
document.getElementById('logout-btn').onclick = () => auth.signOut();
