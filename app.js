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

// --- 1. PRD FORMATTING (Date: 04 Jan to 10 Jan_2026) ---
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

// --- 2. REPORTS TAB (Full PRD Columns) ---
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

        container.innerHTML = '';
        Object.keys(weeks).sort((a,b) => b.localeCompare(a)).forEach(key => {
            const week = weeks[key];
            const div = document.createElement('div');
            div.className = 'week-card';
            div.innerHTML = `
                <div class="week-header" onclick="this.nextElementSibling.classList.toggle('hidden')">
                    <span>${week.range}</span><strong>Score: ${week.total} ▼</strong>
                </div>
                <div class="week-content hidden" style="overflow-x:auto">
                    <table class="admin-table" style="min-width:800px">
                        <thead>
                            <tr>
                                <th>Date</th><th>Bed</th><th>M</th><th>Wake</th><th>M</th>
                                <th>Chant</th><th>M</th><th>Read</th><th>Hear</th>
                                <th>Seva</th><th>Total</th><th>%</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${week.data.map(e => `
                                <tr>
                                    <td>${e.id}</td>
                                    <td>${e.sleepTime}</td><td>${e.scores.sleep}</td>
                                    <td>${e.wakeupTime}</td><td>${e.scores.wakeup}</td>
                                    <td>${e.chantingTime}</td><td>${e.scores.chanting}</td>
                                    <td>${e.readingMinutes}m</td><td>${e.hearingMinutes}m</td>
                                    <td>${e.serviceMinutes || 0}m</td>
                                    <td><strong>${e.totalScore}</strong></td>
                                    <td>${e.dayPercent}%</td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>`;
            container.appendChild(div);
        });
    });
}

// --- 3. EXCEL EXPORT (FIXED & FUNCTIONAL) ---
window.downloadUserExcel = async (userId, userName) => {
    try {
        const snap = await db.collection('users').doc(userId).collection('sadhana').orderBy('submittedAt', 'asc').get();
        if (snap.empty) return alert("No data to download");

        // Building columns as per PRD
        const rows = [["Date", "Bed Time", "Bed Marks", "Wakeup", "Wake Marks", "Chant Time", "Chant Marks", "Read(m)", "Hear(m)", "Seva(m)", "Day Score", "Day %"]];
        
        snap.forEach(doc => {
            const e = doc.data();
            rows.push([
                doc.id, e.sleepTime, e.scores.sleep, e.wakeupTime, e.scores.wakeup, 
                e.chantingTime, e.scores.chanting, e.readingMinutes, e.hearingMinutes, 
                e.serviceMinutes || 0, e.totalScore, e.dayPercent + "%"
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sadhana");
        XLSX.writeFile(wb, `${userName}_Sadhana.xlsx`);
    } catch (err) {
        console.error("Excel Error:", err);
        alert("Download failed. Make sure xlsx library is loaded.");
    }
};

// --- 4. ADMIN & USER MANAGEMENT (MAKE/REMOVE ADMIN) ---
window.makeAdmin = async (uid) => {
    if (confirm("Promote this user to Admin?")) {
        await db.collection('users').doc(uid).update({ role: 'admin' });
        alert("Promoted!"); loadAdminPanel();
    }
};

window.removeAdmin = async (uid) => {
    if (confirm("Remove Admin privileges from this user?")) {
        await db.collection('users').doc(uid).update({ role: 'user' });
        alert("Demoted!"); loadAdminPanel();
    }
};

async function loadAdminPanel() {
    const tableContainer = document.getElementById('admin-comparative-reports-container');
    const usersList = document.getElementById('admin-users-list');
    
    const weeks = [];
    for (let i = 0; i < 4; i++) {
        const d = new Date(); d.setDate(d.getDate() - (i * 7));
        weeks.push(getWeekInfo(d.toISOString().split('T')[0]));
    }
    weeks.reverse();

    const usersSnap = await db.collection('users').get();
    let tableHtml = `<table class="admin-table"><thead><tr><th>User</th><th>Cat</th>${weeks.map(w => `<th>${w.label}</th>`).join('')}</tr></thead><tbody>`;
    
    usersList.innerHTML = ''; 

    for (const uDoc of usersSnap.docs) {
        const u = uDoc.data();
        tableHtml += `<tr><td>${u.name}</td><td>${u.chantingCategory || 'L-?'}</td>`;
        
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

        // User Management Interface
        const uDiv = document.createElement('div');
        uDiv.className = 'card';
        uDiv.style = "margin-bottom:10px; padding:12px; display:flex; justify-content:space-between; align-items:center; background:#fff; border-left:4px solid #3498db";
        uDiv.innerHTML = `
            <div><strong>${u.name}</strong><br><small>${u.role || 'user'}</small></div>
            <div style="display:flex; gap:8px;">
                <button onclick="openUserModal('${uDoc.id}', '${u.name}')" style="width:auto; padding:6px 12px; font-size:12px;">History</button>
                <button onclick="downloadUserExcel('${uDoc.id}', '${u.name}')" style="width:auto; padding:6px 12px; font-size:12px; background:green;">Excel</button>
                ${u.role === 'admin' ? 
                    `<button onclick="removeAdmin('${uDoc.id}')" style="width:auto; padding:6px 12px; font-size:12px; background:red;">Remove Admin</button>` : 
                    `<button onclick="makeAdmin('${uDoc.id}')" style="width:auto; padding:6px 12px; font-size:12px; background:orange;">Make Admin</button>`
                }
            </div>`;
        usersList.appendChild(uDiv);
    }
    tableContainer.innerHTML = tableHtml + `</tbody></table>`;
}

// --- CORE NAVIGATION & AUTH (PREVIOUSLY VERIFIED) ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            document.getElementById('user-display-name').textContent = `${userProfile.name} (${userProfile.chantingCategory})`;
            if (userProfile.role === 'admin') document.getElementById('admin-tab-btn').classList.remove('hidden');
            showSection('dashboard'); switchTab('sadhana'); setupDateSelect();
        } else showSection('profile');
    } else showSection('auth');
});

window.switchTab = (t) => {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const target = document.getElementById(t + '-tab');
    if (target) target.classList.remove('hidden');
    const btn = document.querySelector(`button[onclick*="switchTab('${t}')"]`);
    if (btn) btn.classList.add('active');
    if (t === 'reports') loadReports(currentUser.uid, 'weekly-reports-container');
    if (t === 'admin') loadAdminPanel();
};

function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(id + '-section');
    if (target) target.classList.remove('hidden');
}

window.openProfileEdit = () => {
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
    const sArea = document.getElementById('service-area');
    if (sArea && userProfile.chantingCategory.match(/Level-3|Level-4/)) sArea.classList.remove('hidden');
}

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
