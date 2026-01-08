// --- 1. FIREBASE & CONFIG ---
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
let activeListener = null;

// --- 2. THE LOGIC ENGINE (Points 3, 4, 7, 8) ---

function getWeekRange(dateInput) {
    const d = new Date(dateInput);
    const day = d.getDay(); 
    const sun = new Date(d); sun.setDate(d.getDate() - day);
    const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
    const opt = { day: '2-digit', month: 'short' };
    return {
        sunStr: sun.toISOString().split('T')[0],
        satStr: sat.toISOString().split('T')[0],
        label: `(${sun.toLocaleDateString('en-GB', opt)} - ${sat.toLocaleDateString('en-GB', opt)})`
    };
}

function calculateScores(data) {
    const getM = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const s = {};
    // Scoring based on your group templates
    const sl = getM(data.sleepTime);
    s.sleep = sl <= getM("22:30") ? 25 : (sl <= getM("22:55") ? 25 - (Math.ceil((sl - getM("22:30"))/5)*5) : -5);
    
    const wk = getM(data.wakeupTime);
    s.wakeup = wk <= getM("05:05") ? 25 : (wk <= getM("05:30") ? 25 - (Math.ceil((wk - getM("05:05"))/5)*5) : -5);
    
    const ch = getM(data.chantingTime);
    s.chanting = ch <= getM("09:00") ? 25 : (ch <= getM("19:00") ? 25 - (Math.ceil((ch - getM("09:00"))/30)*5) : -5);

    s.daySleep = data.daySleepMinutes <= 60 ? 25 : -5;
    s.reading = data.readingMinutes >= 30 ? 25 : (data.readingMinutes >= 5 ? (Math.floor(data.readingMinutes/5)-1)*5 : -5);
    s.hearing = data.hearingMinutes >= 30 ? 25 : (data.hearingMinutes >= 5 ? (Math.floor(data.hearingMinutes/5)-1)*5 : -5);
    
    return s;
}

// --- 3. EXCEL EXPORT (Point 5 - Exact Template) ---
async function downloadUserExcel(userId, name) {
    const snap = await db.collection('users').doc(userId).collection('sadhana').orderBy('submittedAt', 'asc').get();
    const rows = snap.docs.map(doc => {
        const e = doc.data();
        return {
            "Date": doc.id,
            "To Bed": e.sleepTime, "Mks_B": e.scores.sleep,
            "Wake Up": e.wakeupTime, "Mks_W": e.scores.wakeup,
            "Chanting": e.chantingTime, "Mks_C": e.scores.chanting,
            "Reading": e.readingMinutes, "Mks_R": e.scores.reading,
            "Hearing": e.hearingMinutes, "Mks_H": e.scores.hearing,
            "Total Score": e.totalScore
        };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sadhana History");
    XLSX.writeFile(wb, `${name}_Sadhana_Full_History.xlsx`);
}

// --- 4. AUTH & NAVIGATION ---
auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    if (user) {
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            document.getElementById('user-display-name').textContent = userProfile.name;
            if (userProfile.role === 'admin') document.getElementById('admin-tab-btn').classList.remove('hidden');
            showView('dashboard'); switchTab('sadhana'); setupDateSelect();
        } else { showView('profile'); }
    } else { showView('auth'); if(activeListener) activeListener(); }
});

function showView(v) {
    ['auth', 'profile', 'dashboard'].forEach(id => document.getElementById(id + '-section').classList.add('hidden'));
    document.getElementById(v + '-section').classList.remove('hidden');
}

// --- 5. DATA SUBMISSION (Live Update) ---
document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const date = document.getElementById('sadhana-date').value;
    const btn = document.querySelector('#sadhana-form button[type="submit"]');

    // 1. Block Edits (Duplicate Entry Check)
    const check = await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(date).get();
    if (check.exists) {
        alert("Sadhana already submitted for this date. Changes are not allowed.");
        return;
    }

    btn.disabled = true;

    // 2. Convert Hrs + Mins to total Minutes for all fields
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

    // Calculate marks using the updated logic
    entry.scores = calculateScores(entry);
    entry.totalScore = Object.values(entry.scores).reduce((a,b) => a+b, 0);

    try {
        await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(date).set(entry);
        alert("Sadhana Submitted successfully!");
        location.reload(); 
    } catch (err) {
        alert("Error: " + err.message);
        btn.disabled = false;
    }
};
    

// --- 6. USER REPORTS (Beautiful View) ---
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
            const div = document.createElement('div');
            div.className = 'week-card';
            div.innerHTML = `
                <div class="week-header" onclick="this.nextElementSibling.classList.toggle('hidden')">
                    <strong>Week ${week.label}</strong> <span>Score: ${week.total}</span>
                </div>
                <div class="week-content">
                    ${week.data.sort((a,b) => b.id.localeCompare(a.id)).map(e => `
                        <div class="day-row">
                            <strong>${e.id}</strong> | Total: ${e.totalScore}<br>
                            <small>Bed: ${e.sleepTime}(${e.scores.sleep}) | Wake: ${e.wakeupTime}(${e.scores.wakeup}) | Chant: ${e.chantingTime}(${e.scores.chanting})</small>
                        </div>
                    `).join('')}
                </div>`;
            container.appendChild(div);
        });
    });
}

// --- 7. ADMIN PANEL (Point 8 & Separate Screen) ---
async function loadAdminPanel() {
    const compContainer = document.getElementById('admin-comparative-reports-container');
    compContainer.innerHTML = '<h3 style="text-align:center;">Last 4 Weeks Comparison</h3>';
    
    const weeks = [];
    for(let i=0; i<4; i++) {
        const d = new Date(); d.setDate(d.getDate() - (i*7));
        weeks.push(getWeekRange(d));
    }
    weeks.reverse();

    let table = `<table class="admin-table">
        <thead><tr><th>Devotee Name (Category)</th>${weeks.map((w,i) => `<th style="text-align:center">Week ${i+1}<br><small>${w.label}</small></th>`).join('')}</tr></thead>
        <tbody>`;

    const usersSnap = await db.collection('users').get();
    const listContainer = document.getElementById('admin-users-list');
    listContainer.innerHTML = '<h3>Manage Users</h3>';

    for (const uDoc of usersSnap.docs) {
        const u = uDoc.data();
        const cat = u.chantingCategory || "Not Set";
        // Comparative Row
        table += `<tr><td><strong>${u.name}</strong><br><small>Category: ${cat}</small></td>`;
        
        const sSnap = await uDoc.ref.collection('sadhana').get();
        const sData = sSnap.docs.map(d => ({id: d.id, score: d.data().totalScore}));
        
        weeks.forEach(w => {
            const total = sData.filter(s => s.id >= w.sunStr && s.id <= w.satStr).reduce((a,b) => a+b.score, 0);
            table += `<td style="text-align:center">${total}</td>`;
        });
        table += `</tr>`;

        // Manage Users List Row
        const userDiv = document.createElement('div');
        userDiv.className = 'admin-user-item';
        userDiv.innerHTML = `
            <div>
                <strong>${u.name} (${cat})</strong><br><small>${u.email}</small>
            </div>
            <div>
                <button onclick="openUserModal('${uDoc.id}', '${u.name}')">View</button>
                <button onclick="downloadUserExcel('${uDoc.id}', '${u.name}')">Excel</button>
                <button class="danger" onclick="toggleAdmin('${uDoc.id}', '${u.role}')">${u.role === 'admin' ? 'Revoke Admin' : 'Make Admin'}</button>
            </div>
        `;
        listContainer.appendChild(userDiv);
    }
    compContainer.innerHTML += table + '</tbody></table>';
}

// --- 8. ADMIN FUNCTIONS (Accident Proof) ---
async function toggleAdmin(userId, currentRole) {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    const confirmMsg = `Are you absolutely sure you want to ${newRole === 'admin' ? 'PROMOTE' : 'DEMOTE'} this user?`;
    if (confirm(confirmMsg)) {
        await db.collection('users').doc(userId).update({ role: newRole });
        alert("Permissions updated!");
        loadAdminPanel();
    }
}

// MODAL CONTROLS (Separate Room)
window.openUserModal = (id, name) => {
    document.getElementById('user-report-modal').classList.remove('hidden');
    document.getElementById('modal-user-name').textContent = "Sadhana Report: " + name;
    loadReports(id, 'modal-report-container');
};
window.closeUserModal = () => {
    document.getElementById('user-report-modal').classList.add('hidden');
    if (activeListener) activeListener();
};

window.switchTab = (t) => {
    document.querySelectorAll('.tab-content, .tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(t + '-tab').classList.add('active');
    if (t === 'reports') loadReports(currentUser.uid, 'weekly-reports-container');
    if (t === 'admin') loadAdminPanel();
};

function setupDateSelect() {
    const s = document.getElementById('sadhana-date'); s.innerHTML = '';
    for(let i=0; i<2; i++) { // Changed to 2 days only
        const d = new Date(); d.setDate(d.getDate()-i);
        const iso = d.toISOString().split('T')[0];
        const opt = document.createElement('option'); opt.value = iso; 
        opt.textContent = i===0 ? "Today" : "Yesterday";
        s.appendChild(opt);
    }
    // Logic to show Service field for L3 and L4
    if (userProfile && (userProfile.chantingCategory.includes('Level-3') || userProfile.chantingCategory.includes('Level-4'))) {
        const serviceArea = document.getElementById('service-area');
        if(serviceArea) serviceArea.classList.remove('hidden');
    }
}
