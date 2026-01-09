// --- FIREBASE INITIALIZATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDbRy8ZMJAWeTyZVnTphwRIei6jAckagjA",
    authDomain: "sadhana-tracker-b65ff.firebaseapp.com",
    projectId: "sadhana-tracker-b65ff",
    storageBucket: "sadhana-tracker-b65ff.firebasestorage.app",
    messagingSenderId: "926961218888",
    appId: "1:926961218888:web:db8f12ef8256d13f036f7d"
};
if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const auth = firebase.auth(), db = firebase.firestore();
let currentUser = null, userProfile = null, activeListener = null;

// --- 1. DATE LOGIC (Specified Pattern: 04 Jan to 10 Jan_2026) ---
function getWeekInfo(dateStr) {
    const d = new Date(dateStr);
    const sun = new Date(d); sun.setDate(d.getDate() - d.getDay());
    const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
    
    const fmt = (date) => {
        const day = String(date.getDate()).padStart(2, '0');
        const month = date.toLocaleString('en-GB', { month: 'short' });
        return `${day} ${month}`;
    };
    return { 
        sunStr: sun.toISOString().split('T')[0], 
        label: `${fmt(sun)} to ${fmt(sat)}_${sun.getFullYear()}` 
    };
}

// --- 2. AUTH & PROFILE (Efficiency: Single Observer) ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            document.getElementById('user-display-name').textContent = `${userProfile.name} (${userProfile.chantingCategory})`;
            // Effectiveness Check: Admin visibility
            const adminBtn = document.getElementById('admin-tab-btn');
            if (userProfile.role === 'admin' && adminBtn) adminBtn.classList.remove('hidden');
            
            showSection('dashboard');
            switchTab('sadhana');
            setupDateSelect();
        } else {
            showSection('profile');
        }
    } else {
        showSection('auth');
    }
});

// --- 3. DYNAMIC NAVIGATION FIX ---
window.switchTab = (t) => {
    // Hide content areas ONLY
    const containers = ['sadhana-tab', 'reports-tab', 'admin-tab'];
    containers.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    const target = document.getElementById(t + '-tab');
    if (target) target.classList.remove('hidden');
    
    const activeBtn = document.querySelector(`button[onclick*="switchTab('${t}')"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Data Loading
    if (t === 'reports') loadReports(currentUser.uid, 'weekly-reports-container');
    if (t === 'admin') loadAdminPanel();
};

function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(id + '-section');
    if (target) target.classList.remove('hidden');
}

// --- 4. REPORTS (Effectiveness: Real-time Table Generation) ---
function loadReports(userId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (activeListener) activeListener();

    activeListener = db.collection('users').doc(userId).collection('sadhana').orderBy('submittedAt', 'desc').onSnapshot(snap => {
        const weeks = {};
        snap.forEach(doc => {
            const e = doc.data(), w = getWeekInfo(doc.id);
            if (!weeks[w.sunStr]) weeks[w.sunStr] = { range: w.label, data: [], total: 0 };
            weeks[w.sunStr].data.push({ id: doc.id, ...e });
            weeks[w.sunStr].total += (e.totalScore || 0);
        });

        container.innerHTML = Object.keys(weeks).length ? '' : '<p>No records found.</p>';
        Object.keys(weeks).sort((a,b) => b.localeCompare(a)).forEach(key => {
            const week = weeks[key];
            const div = document.createElement('div');
            div.className = 'week-card';
            div.innerHTML = `
                <div class="week-header" onclick="this.nextElementSibling.classList.toggle('hidden')" style="cursor:pointer; display:flex; justify-content:space-between; padding:10px; background:#eee; margin-top:5px; border-radius:5px;">
                    <span>${week.range}</span><strong>Total: ${week.total}</strong>
                </div>
                <div class="week-content hidden">
                    <table class="admin-table" style="width:100%; border-collapse:collapse; font-size:12px;">
                        <thead><tr style="background:#f9f9f9"><th>Date</th><th>Score</th><th>Bed</th><th>Wake</th></tr></thead>
                        <tbody>${week.data.map(e => `<tr><td>${e.id}</td><td>${e.totalScore}</td><td>${e.sleepTime}</td><td>${e.wakeupTime}</td></tr>`).join('')}</tbody>
                    </table>
                </div>`;
            container.appendChild(div);
        });
    });
}

// --- 5. ADMIN & USER MANAGEMENT (Efficiency: Parallel Data Processing) ---
async function loadAdminPanel() {
    const tableContainer = document.getElementById('admin-comparative-reports-container');
    const usersList = document.getElementById('admin-users-list');
    if (!tableContainer || !usersList) return;

    const weeks = [];
    for (let i = 0; i < 4; i++) {
        const d = new Date(); d.setDate(d.getDate() - (i * 7));
        weeks.push(getWeekInfo(d.toISOString().split('T')[0]));
    }
    weeks.reverse();

    const usersSnap = await db.collection('users').get();
    let tableHtml = `<table class="admin-table"><thead><tr><th>User Name</th><th>Category</th>${weeks.map(w => `<th>${w.label}</th>`).join('')}</tr></thead><tbody>`;
    
    usersList.innerHTML = ''; // Reset User List

    for (const uDoc of usersSnap.docs) {
        const u = uDoc.data();
        tableHtml += `<tr><td>${u.name}</td><td>${u.chantingCategory || 'N/A'}</td>`;
        
        const sSnap = await uDoc.ref.collection('sadhana').get();
        const sEntries = sSnap.docs.map(d => ({ date: d.id, score: d.data().totalScore || 0 }));

        weeks.forEach(w => {
            let weekTotal = 0; let curr = new Date(w.sunStr);
            for (let i = 0; i < 7; i++) {
                const ds = curr.toISOString().split('T')[0];
                const entry = sEntries.find(e => e.date === ds);
                weekTotal += entry ? entry.score : -30;
                curr.setDate(curr.getDate() + 1);
            }
            tableHtml += `<td>${weekTotal}</td>`;
        });
        tableHtml += `</tr>`;

        // Effectiveness: Adding Management Buttons
        const uDiv = document.createElement('div');
        uDiv.className = 'card';
        uDiv.style = "margin-bottom:10px; padding:10px; display:flex; justify-content:space-between; align-items:center;";
        uDiv.innerHTML = `
            <div><strong>${u.name}</strong><br><small>${u.email}</small></div>
            <div style="display:flex; gap:5px;">
                <button onclick="openUserModal('${uDoc.id}', '${u.name}')" style="width:auto; padding:5px; font-size:11px;">History</button>
                <button onclick="downloadUserExcel('${uDoc.id}', '${u.name}')" style="width:auto; padding:5px; font-size:11px; background:green;">Excel</button>
                ${u.role !== 'admin' ? `<button onclick="makeAdmin('${uDoc.id}')" style="width:auto; padding:5px; font-size:11px; background:orange;">Make Admin</button>` : ''}
            </div>`;
        usersList.appendChild(uDiv);
    }
    tableContainer.innerHTML = tableHtml + `</tbody></table>`;
}

// --- 6. EXCEL DOWNLOADS (Effectiveness: Direct Blob Handling) ---
window.downloadUserExcel = async (userId, userName) => {
    try {
        const snap = await db.collection('users').doc(userId).collection('sadhana').orderBy('submittedAt', 'asc').get();
        const data = [["Date", "Total Score", "Bed Time", "Wakeup", "Chanting", "Reading (m)", "Hearing (m)", "Service (m)"]];
        snap.forEach(doc => {
            const e = doc.data();
            data.push([doc.id, e.totalScore, e.sleepTime, e.wakeupTime, e.chantingTime, e.readingMinutes, e.hearingMinutes, e.serviceMinutes || 0]);
        });
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sadhana History");
        XLSX.writeFile(wb, `${userName}_Sadhana_Tracker.xlsx`);
    } catch (e) { alert("Excel Export Failed: " + e.message); }
};

// --- 7. CORE ACTIONS ---
window.makeAdmin = async (uid) => {
    if (confirm("Promote this user to Admin?")) {
        await db.collection('users').doc(uid).update({ role: 'admin' });
        alert("Role Updated!"); loadAdminPanel();
    }
};

window.openProfileEdit = () => {
    if (!userProfile) return;
    document.getElementById('profile-name').value = userProfile.name || "";
    document.getElementById('profile-chanting').value = userProfile.chantingCategory || "";
    document.getElementById('profile-exact-rounds').value = userProfile.exactRounds || "";
    document.getElementById('cancel-edit').classList.remove('hidden');
    showSection('profile');
};

function setupDateSelect() {
    const s = document.getElementById('sadhana-date');
    if (!s) return;
    s.innerHTML = '';
    for (let i = 0; i < 2; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const iso = d.toISOString().split('T')[0];
        const opt = document.createElement('option'); opt.value = iso; opt.textContent = iso;
        s.appendChild(opt);
    }
    // Effectiveness: Conditional Service area
    const sArea = document.getElementById('service-area');
    if (sArea && userProfile.chantingCategory.match(/Level-3|Level-4/)) {
        sArea.classList.remove('hidden');
    }
}

// --- INITIAL HANDLERS ---
document.getElementById('login-form').onsubmit = (e) => {
    e.preventDefault();
    auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value).catch(err => alert(err.message));
};
document.getElementById('logout-btn').onclick = () => auth.signOut();
window.openUserModal = (id, name) => { 
    document.getElementById('user-report-modal').classList.remove('hidden'); 
    document.getElementById('modal-user-name').textContent = name; 
    loadReports(id, 'modal-report-container'); 
};
window.closeUserModal = () => document.getElementById('user-report-modal').classList.add('hidden');
