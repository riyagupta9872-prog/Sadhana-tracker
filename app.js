// --- FIREBASE CONFIG ---
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
let currentUser = null, userProfile = null, activeListener = null;

// --- 1. SCORING ENGINE (PRD DIVISORS) ---
const getBaseScore = (cat) => (cat && (cat.includes('Level-3') || cat.includes('Level-4'))) ? 160 : 135;

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
    else if (ch <= 1140) s.chanting = 0;
    else s.chanting = -5;

    s.daySleep = data.daySleepMinutes <= 60 ? 25 : -5;
    const calcRH = (m) => (m >= 30 ? 25 : (m >= 5 ? (Math.floor(m/5)-1)*5 : -5));
    s.reading = calcRH(data.readingMinutes);
    s.hearing = calcRH(data.hearingMinutes);
    s.service = (data.serviceMinutes >= 30) ? 25 : 0;
    return s;
}

// --- 2. AUTH & INITIALIZATION ---
auth.onAuthStateChanged(async (user) => {
    console.log("Auth State:", user ? "Logged In" : "Logged Out");
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            console.log("User Profile Loaded:", userProfile.name, "Role:", userProfile.role);
            
            document.getElementById('user-display-name').textContent = `${userProfile.name} (${userProfile.chantingCategory})`;
            
            // ADMIN CHECK: Only show if role is exactly 'admin'
            if (userProfile.role === 'admin') {
                console.log("Admin privileges detected.");
                document.getElementById('admin-tab-btn').classList.remove('hidden');
            }
            
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

// --- 3. NAVIGATION (FIXED: NO LONGER HIDES BUTTONS) ---
window.switchTab = (t) => {
    console.log("Switching to tab:", t);
    // Hide all tab content containers
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    // Deactivate all tab buttons
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    // Show the targeted content
    const target = document.getElementById(t + '-tab');
    if (target) {
        target.classList.remove('hidden');
    } else {
        console.error("Tab ID not found:", t + '-tab');
    }

    // Activate the clicked button
    const btn = document.querySelector(`button[onclick*="switchTab('${t}')"]`);
    if(btn) btn.classList.add('active');

    if(t === 'reports') loadReports(currentUser.uid, 'weekly-reports-container');
    if(t === 'admin') loadAdminPanel();
};

function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(id + '-section').classList.remove('hidden');
}

// --- 4. DATA ENTRY ---
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
    }
}

document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const date = document.getElementById('sadhana-date').value;
    const check = await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(date).get();
    if (check.exists) return alert("Sadhana already submitted for this date!");

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
    const divisor = getBaseScore(userProfile.chantingCategory);
    entry.dayPercent = ((entry.totalScore / divisor) * 100).toFixed(1);

    await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(date).set(entry);
    alert("Sadhana Saved Successfully!");
    location.reload();
};

// --- 5. REPORTS ENGINE ---
function getWeekInfo(dateStr) {
    const d = new Date(dateStr);
    const sun = new Date(d); sun.setDate(d.getDate() - d.getDay());
    const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
    return { sunStr: sun.toISOString().split('T')[0], label: `${sun.toLocaleDateString('en-GB')} to ${sat.toLocaleDateString('en-GB')}` };
}

function loadReports(userId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (activeListener) activeListener();
    
    activeListener = db.collection('users').doc(userId).collection('sadhana').orderBy('submittedAt','desc').onSnapshot(snap => {
        const weeks = {};
        snap.forEach(doc => {
            const e = doc.data(), w = getWeekInfo(doc.id);
            if(!weeks[w.sunStr]) weeks[w.sunStr] = { range: w.label, data: [], total: 0 };
            weeks[w.sunStr].data.push({id: doc.id, ...e}); 
            weeks[w.sunStr].total += e.totalScore;
        });
        
        container.innerHTML = '';
        const sortedWeeks = Object.keys(weeks).sort((a,b) => b.localeCompare(a)).slice(0,4);
        
        if (sortedWeeks.length === 0) {
            container.innerHTML = "<p style='text-align:center; padding:20px;'>No history found yet.</p>";
            return;
        }

        sortedWeeks.forEach(key => {
            const week = weeks[key];
            const div = document.createElement('div'); div.className = 'week-card';
            div.innerHTML = `
                <div class="week-header" onclick="this.nextElementSibling.classList.toggle('hidden')">
                    <span>📅 ${week.range}</span><span>Total: ${week.total} pts</span>
                </div>
                <div class="week-content hidden">
                    <table style="width:100%; font-size:12px; border-collapse:collapse; margin-top:10px;">
                        <tr style="background:#f4f4f4; text-align:left;"><th>Date</th><th>Score</th><th>%</th></tr>
                        ${week.data.map(e => `<tr><td>${e.id}</td><td>${e.totalScore}</td><td>${e.dayPercent}%</td></tr>`).join('')}
                    </table>
                </div>`;
            container.appendChild(div);
        });
    });
}

// --- 6. ADMIN ENGINE ---
async function loadAdminPanel() {
    console.log("Loading Admin Data...");
    const tableContainer = document.getElementById('admin-comparative-reports-container');
    const usersList = document.getElementById('admin-users-list');
    
    const weeks = []; for(let i=0; i<4; i++) {
        const d = new Date(); d.setDate(d.getDate() - (i*7)); weeks.push(getWeekInfo(d.toISOString().split('T')[0]));
    }
    weeks.reverse();

    try {
        const usersSnap = await db.collection('users').get();
        let table = `<table class="admin-table"><thead><tr><th>User Name</th>${weeks.map(w => `<th>${w.label}</th>`).join('')}</tr></thead><tbody>`;
        usersList.innerHTML = '';

        for (const uDoc of usersSnap.docs) {
            const u = uDoc.data();
            table += `<tr><td style="text-align:left; font-weight:bold;">${u.name}</td>`;
            const sSnap = await uDoc.ref.collection('sadhana').get();
            const sEntries = sSnap.docs.map(d => ({date: d.id, score: d.data().totalScore || 0}));
            
            weeks.forEach(w => {
                let weekTotal = 0; let curr = new Date(w.sunStr);
                for(let i=0; i<7; i++) {
                    const ds = curr.toISOString().split('T')[0];
                    const f = sEntries.find(e => e.date === ds);
                    weekTotal += f ? f.score : -30; // Penalty for missing days
                    curr.setDate(curr.getDate() + 1);
                }
                table += `<td>${weekTotal}</td>`;
            });
            table += `</tr>`;
            
            const uItem = document.createElement('div'); uItem.style = "display:flex; justify-content:space-between; padding:12px; border-bottom:1px solid #eee; align-items:center;";
            uItem.innerHTML = `<span>${u.name} (${u.chantingCategory})</span>
                <button onclick="openUserModal('${uDoc.id}', '${u.name}')" style="width:auto; padding:6px 12px; margin:0;">View Detail</button>`;
            usersList.appendChild(uItem);
        }
        tableContainer.innerHTML = table + '</tbody></table>';
    } catch (err) {
        console.error("Admin Load Failed:", err);
        tableContainer.innerHTML = "<p style='color:red'>Permission Denied: Ensure your role is set to 'admin' in Firestore.</p>";
    }
}

// --- 7. AUTH & HELPERS ---
document.getElementById('login-form').onsubmit = (e) => {
    e.preventDefault();
    auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value).catch(err => alert(err.message));
};

document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        name: document.getElementById('profile-name').value,
        chantingCategory: document.getElementById('profile-chanting').value,
        exactRounds: document.getElementById('profile-exact-rounds').value,
        role: userProfile ? userProfile.role : 'user',
        email: currentUser.email
    };
    await db.collection('users').doc(currentUser.uid).set(data, {merge:true});
    location.reload();
};

document.getElementById('logout-btn').onclick = () => auth.signOut();
window.openUserModal = (id, name) => { 
    document.getElementById('user-report-modal').classList.remove('hidden'); 
    document.getElementById('modal-user-name').textContent = name; 
    loadReports(id, 'modal-report-container'); 
};
window.closeUserModal = () => document.getElementById('user-report-modal').classList.add('hidden');
