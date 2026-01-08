// --- CONFIG & GLOBAL ---
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

// --- SCORING ENGINE ---
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
    else if (ch <= getM("14:30")) s.chanting = 10;
    else if (ch <= getM("17:00")) s.chanting = 5;
    else if (ch <= 1140) s.chanting = 0; // 7:00 PM
    else s.chanting = -5;

    s.daySleep = data.daySleepMinutes <= 60 ? 25 : -5;
    const calcRH = (m) => (m >= 30 ? 25 : (m >= 5 ? (Math.floor(m/5)-1)*5 : -5));
    s.reading = calcRH(data.readingMinutes);
    s.hearing = calcRH(data.hearingMinutes);
    s.service = (data.serviceMinutes >= 30) ? 25 : 0;

    return s;
}

// --- AUTH ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            document.getElementById('user-display-name').textContent = `${userProfile.name} | ${userProfile.chantingCategory}`;
            if (userProfile.role === 'admin') document.getElementById('admin-tab-btn').classList.remove('hidden');
            showSection('dashboard'); switchTab('sadhana'); setupDateSelect();
        } else { showSection('profile'); }
    } else { showSection('auth'); }
});

function setupDateSelect() {
    const s = document.getElementById('sadhana-date'); s.innerHTML = '';
    for(let i=0; i<2; i++) {
        const d = new Date(); d.setDate(d.getDate()-i);
        const iso = d.toISOString().split('T')[0];
        const opt = document.createElement('option'); opt.value = iso; opt.textContent = iso;
        s.appendChild(opt);
    }
    const cat = userProfile.chantingCategory || "";
    if (cat.includes('Level-3') || cat.includes('Level-4')) {
        document.getElementById('service-area').classList.remove('hidden');
        document.getElementById('service-hrs').required = true;
        document.getElementById('service-mins').required = true;
    }
}

// --- SUBMISSION ---
document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const date = document.getElementById('sadhana-date').value;
    const btn = document.getElementById('submit-btn');

    const check = await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(date).get();
    if (check.exists) return alert("Entry for " + date + " already exists!");

    btn.disabled = true;
    const rM = (parseInt(document.getElementById('reading-hrs').value)||0)*60 + (parseInt(document.getElementById('reading-mins').value)||0);
    const hM = (parseInt(document.getElementById('hearing-hrs').value)||0)*60 + (parseInt(document.getElementById('hearing-mins').value)||0);
    const sM = (parseInt(document.getElementById('service-hrs').value)||0)*60 + (parseInt(document.getElementById('service-mins').value)||0);

    const entry = {
        sleepTime: document.getElementById('sleep-time').value,
        wakeupTime: document.getElementById('wakeup-time').value,
        chantingTime: document.getElementById('chanting-time').value,
        readingMinutes: rM, hearingMinutes: hM, serviceMinutes: sM,
        daySleepMinutes: parseInt(document.getElementById('day-sleep-minutes').value) || 0,
        submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    entry.scores = calculateMarks(entry);
    entry.totalScore = Object.values(entry.scores).reduce((a,b) => a+b, 0);

    try {
        await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(date).set(entry);
        alert("Sadhana Saved!"); location.reload();
    } catch (err) { alert(err.message); btn.disabled = false; }
};

// --- NAVIGATION & UI ---
function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(id + '-section').classList.remove('hidden');
}

window.switchTab = (t) => {
    document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelector(`button[onclick*="switchTab('${t}')"]`).classList.add('active');
    document.getElementById(t + '-tab').classList.remove('hidden');
    if(t === 'reports') loadReports(currentUser.uid, 'weekly-reports-container');
    if(t === 'admin') loadAdminPanel();
};

function getWeekInfo(dateStr) {
    const d = new Date(dateStr);
    const sun = new Date(d); sun.setDate(d.getDate() - d.getDay());
    const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
    const opt = { day: '2-digit', month: 'short' };
    return { sunStr: sun.toISOString().split('T')[0], label: `(${sun.toLocaleDateString('en-GB', opt)} - ${sat.toLocaleDateString('en-GB', opt)})` };
}

// --- REPORTS LOGIC ---
function loadReports(userId, containerId) {
    const container = document.getElementById(containerId);
    if (activeListener) activeListener();
    activeListener = db.collection('users').doc(userId).collection('sadhana').orderBy('submittedAt','desc').onSnapshot(snap => {
        const weeks = {};
        snap.forEach(doc => {
            const e = doc.data(), w = getWeekInfo(doc.id);
            if(!weeks[w.sunStr]) weeks[w.sunStr] = { range: w.label, data: [], total: 0 };
            weeks[w.sunStr].data.push({id: doc.id, ...e}); weeks[w.sunStr].total += e.totalScore;
        });
        container.innerHTML = '';
        Object.keys(weeks).sort((a,b) => b.localeCompare(a)).forEach(key => {
            const week = weeks[key];
            const div = document.createElement('div'); div.className = 'week-card';
            div.innerHTML = `<div class="week-header" onclick="this.nextElementSibling.classList.toggle('hidden')">
                <span>Week ${week.range}</span><span>Score: ${week.total}</span></div>
                <div class="week-content hidden">${week.data.map(e => `
                <div class="day-row"><strong>${e.id} | Score: ${e.totalScore}</strong><br>
                <small>Bed: ${e.sleepTime} | Wake: ${e.wakeupTime} | Read: ${e.readingMinutes}m | Hear: ${e.hearingMinutes}m</small></div>`).join('')}</div>`;
            container.appendChild(div);
        });
    });
}

// --- ADMIN LOGIC ---
async function loadAdminPanel() {
    const tableContainer = document.getElementById('admin-comparative-reports-container');
    const usersList = document.getElementById('admin-users-list');
    const weeks = []; for(let i=0; i<4; i++) {
        const d = new Date(); d.setDate(d.getDate() - (i*7)); weeks.push(getWeekInfo(d));
    }
    weeks.reverse();
    const usersSnap = await db.collection('users').get();
    let table = `<table class="admin-table"><thead><tr><th>Name</th>${weeks.map(w => `<th>${w.label}</th>`).join('')}</tr></thead><tbody>`;
    usersList.innerHTML = '';
    for (const uDoc of usersSnap.docs) {
        const u = uDoc.data();
        table += `<tr><td><strong>${u.name}</strong></td>`;
        const sSnap = await uDoc.ref.collection('sadhana').get();
        const sEntries = sSnap.docs.map(d => ({date: d.id, score: d.data().totalScore || 0}));
        weeks.forEach(w => {
            let weekTotal = 0; let curr = new Date(w.sunStr);
            for(let i=0; i<7; i++) {
                const ds = curr.toISOString().split('T')[0];
                const f = sEntries.find(e => e.date === ds);
                weekTotal += f ? f.score : -30;
                curr.setDate(curr.getDate() + 1);
            }
            table += `<td>${weekTotal}</td>`;
        });
        table += `</tr>`;
        const uItem = document.createElement('div'); uItem.className = 'user-item';
        uItem.innerHTML = `<div><strong>${u.name}</strong><br><small>${u.chantingCategory}</small></div>
            <div class="user-actions">
                <button onclick="openUserModal('${uDoc.id}', '${u.name}')">View</button>
                <button style="background:var(--success)" onclick="downloadUserExcel('${uDoc.id}', '${u.name}')">Excel</button>
            </div>`;
        usersList.appendChild(uItem);
    }
    tableContainer.innerHTML = table + '</tbody></table>';
}

// --- EXCEL EXPORTS ---
async function downloadUserExcel(id, name) {
    const snap = await db.collection('users').doc(id).collection('sadhana').orderBy('submittedAt','asc').get();
    const rows = [["Date", "Bed", "Wake", "Chant", "Read(m)", "Hear(m)", "Service(m)", "Score"]];
    snap.forEach(doc => { const e = doc.data(); rows.push([doc.id, e.sleepTime, e.wakeupTime, e.chantingTime, e.readingMinutes, e.hearingMinutes, e.serviceMinutes || 0, e.totalScore]); });
    const ws = XLSX.utils.aoa_to_sheet(rows); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sadhana"); XLSX.writeFile(wb, `${name}_Report.xlsx`);
}

async function downloadMasterReport() {
    const users = await db.collection('users').get();
    const wb = XLSX.utils.book_new();
    for (const uDoc of users.docs) {
        const u = uDoc.data();
        const snap = await uDoc.ref.collection('sadhana').orderBy('submittedAt','asc').get();
        const rows = [["Date", "Bed", "Wake", "Chant", "Read", "Hear", "Service", "Score"]];
        snap.forEach(d => { const e = d.data(); rows.push([d.id, e.sleepTime, e.wakeupTime, e.chantingTime, e.readingMinutes, e.hearingMinutes, e.serviceMinutes||0, e.totalScore]); });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), u.name.substring(0,30));
    }
    XLSX.writeFile(wb, "Master_Report.xlsx");
}

// --- PROFILE & AUTH UTILS ---
function openProfileEdit() {
    document.getElementById('profile-name').value = userProfile.name;
    document.getElementById('profile-chanting').value = userProfile.chantingCategory;
    document.getElementById('profile-exact-rounds').value = userProfile.exactRounds;
    document.getElementById('cancel-edit').classList.remove('hidden');
    showSection('profile');
}

document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = { 
        name: document.getElementById('profile-name').value, 
        chantingCategory: document.getElementById('profile-chanting').value,
        exactRounds: document.getElementById('profile-exact-rounds').value,
        role: userProfile ? userProfile.role : 'user', 
        email: currentUser.email
    };
    await db.collection('users').doc(currentUser.uid).set(data, {merge: true});
    location.reload(); 
};

document.getElementById('login-form').onsubmit = (e) => {
    e.preventDefault();
    auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value).catch(err => alert(err.message));
};

window.openUserModal = (id, name) => { 
    document.getElementById('user-report-modal').classList.remove('hidden'); 
    document.getElementById('modal-user-name').textContent = name; 
    loadReports(id, 'modal-report-container'); 
};
window.closeUserModal = () => document.getElementById('user-report-modal').classList.add('hidden');
document.getElementById('logout-btn').onclick = () => auth.signOut();
