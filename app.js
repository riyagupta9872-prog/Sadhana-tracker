// --- 1. FIREBASE CONFIGURATION (Verified) ---
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
let reportsListener = null; // Essential for real-time visibility

// --- 2. DATE & WEEK LOGIC (Sunday to Saturday) ---
function getWeekRangeInfo(dateInput) {
    const d = new Date(dateInput);
    const day = d.getDay(); 
    const sun = new Date(d);
    sun.setDate(d.getDate() - day); // Roll back to Sunday
    const sat = new Date(sun);
    sat.setDate(sun.getDate() + 6); // Forward to Saturday
    
    const options = { day: '2-digit', month: 'short' };
    const dateRange = `(${sun.toLocaleDateString('en-GB', options)} - ${sat.toLocaleDateString('en-GB', options)})`;
    
    return {
        sundayStr: sun.toISOString().split('T')[0],
        saturdayStr: sat.toISOString().split('T')[0],
        displayRange: dateRange
    };
}

// --- 3. AUTHENTICATION & INITIALIZATION ---
auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    if (user) {
        const profileDoc = await db.collection('users').doc(user.uid).get();
        if (profileDoc.exists) {
            userProfile = profileDoc.data();
            document.getElementById('user-display-name').textContent = userProfile.name;
            setupDateSelect();
            if (userProfile.role === 'admin') {
                document.getElementById('admin-tab-btn').classList.remove('hidden');
            }
            showView('dashboard');
            switchTab('sadhana');
        } else {
            showView('profile');
        }
    } else {
        showView('auth');
        if (reportsListener) reportsListener(); // Stop listening on logout
    }
});

function showView(viewName) {
    const sections = ['auth', 'profile', 'dashboard'];
    sections.forEach(s => document.getElementById(s + '-section').classList.add('hidden'));
    document.getElementById(viewName + '-section').classList.remove('hidden');
}

// --- 4. SCORING LOGIC (Correlated with your Template) ---
function getMins(t) { 
    if(!t) return 0;
    const [h, m] = t.split(':').map(Number); 
    return h * 60 + m; 
}

function calculateScores(data) {
    const s = {};
    // Nidra (Sleep)
    const sleep = getMins(data.sleepTime);
    if (sleep <= getMins("22:30")) s.sleep = 25;
    else if (sleep <= getMins("22:35")) s.sleep = 20;
    else if (sleep <= getMins("22:40")) s.sleep = 15;
    else if (sleep <= getMins("22:45")) s.sleep = 10;
    else if (sleep <= getMins("22:50")) s.sleep = 5;
    else if (sleep <= getMins("22:55")) s.sleep = 0;
    else s.sleep = -5;

    // Wakeup
    const wake = getMins(data.wakeupTime);
    if (wake <= getMins("05:05")) s.wakeup = 25;
    else if (wake <= getMins("05:10")) s.wakeup = 20;
    else if (wake <= getMins("05:15")) s.wakeup = 15;
    else if (wake <= getMins("05:20")) s.wakeup = 10;
    else if (wake <= getMins("05:25")) s.wakeup = 5;
    else if (wake <= getMins("05:30")) s.wakeup = 0;
    else s.wakeup = -5;

    // Chanting
    const chant = getMins(data.chantingTime);
    if (chant <= getMins("09:00")) s.chanting = 25;
    else if (chant <= getMins("09:30")) s.chanting = 20;
    else if (chant <= getMins("11:00")) s.chanting = 15;
    else if (chant <= getMins("14:30")) s.chanting = 10;
    else if (chant <= getMins("17:00")) s.chanting = 5;
    else if (chant <= getMins("19:00")) s.chanting = 0;
    else s.chanting = -5;

    s.daySleep = data.daySleepMinutes <= 60 ? 25 : -5;
    
    // Pathan & Sarwan
    const r = data.readingMinutes;
    s.reading = r >= 30 ? 25 : (r >= 5 ? (Math.floor(r/5)-1)*5 : -5);
    const h = data.hearingMinutes;
    s.hearing = h >= 30 ? 25 : (h >= 5 ? (Math.floor(h/5)-1)*5 : -5);

    return s;
}

// --- 5. DATA SUBMISSION ---
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
    alert("Sadhana Saved! Check your reports.");
    document.getElementById('sadhana-form').reset();
});

// --- 6. REAL-TIME REPORTS (Visibility Fix) ---
function loadReports(userId, containerId) {
    const container = document.getElementById(containerId);
    if (reportsListener) reportsListener(); // Clean old listener

    reportsListener = db.collection('users').doc(userId).collection('sadhana')
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
            Object.keys(weeks).sort((a,b) => b.localeCompare(a)).forEach(weekId => {
                const week = weeks[weekId];
                const weekDiv = document.createElement('div');
                weekDiv.className = 'week-summary';
                weekDiv.innerHTML = `
                    <div class="week-header" onclick="toggleWeek(this)">
                        <span>Week ${week.label}</span>
                        <span>Weekly Score: ${week.total}</span>
                    </div>
                    <div class="week-details expanded">
                        ${week.data.sort((a,b) => b.date.localeCompare(a.date)).map(e => `
                            <div class="daily-entry">
                                <strong>${e.date} | Score: ${e.totalScore}</strong><br>
                                <small>S:${e.scores.sleep} W:${e.scores.wakeup} C:${e.scores.chanting} R:${e.scores.reading} H:${e.scores.hearing} D:${e.scores.daySleep}</small>
                            </div>
                        `).join('')}
                    </div>
                `;
                container.appendChild(weekDiv);
            });
        });
}

// --- 7. ADMIN COMPARATIVE TABLE (Centered Headers) ---
async function loadAdminComparativeTable() {
    const container = document.getElementById('admin-comparative-reports-container');
    container.innerHTML = 'Calculating totals...';

    const weeks = [];
    for (let i = 0; i < 4; i++) {
        const d = new Date();
        d.setDate(d.getDate() - (i * 7));
        weeks.push(getWeekRangeInfo(d));
    }
    weeks.reverse();

    const usersSnap = await db.collection('users').get();
    let html = `<table style="width:100%; border-collapse: collapse; margin-top:20px;">
                <thead><tr style="background:#f4f4f4;">
                <th style="border:1px solid #ddd; padding:10px; text-align:left;">Devotee Name</th>`;
    
    weeks.forEach((w, i) => {
        html += `<th style="border:1px solid #ddd; padding:10px; text-align:center;">
                    Week ${i + 1}<br>
                    <span style="font-weight:normal; font-size:0.8em;">${w.displayRange}</span>
                 </th>`;
    });
    html += `</tr></thead><tbody>`;

    for (const uDoc of usersSnap.docs) {
        const u = uDoc.data();
        html += `<tr><td style="border:1px solid #ddd; padding:10px;">${u.name}</td>`;
        
        const sSnap = await uDoc.ref.collection('sadhana').get();
        const sEntries = sSnap.docs.map(d => ({date: d.id, score: d.data().totalScore || 0}));

        weeks.forEach(w => {
            const total = sEntries
                .filter(e => e.date >= w.sundayStr && e.date <= w.saturdayStr)
                .reduce((sum, e) => sum + e.score, 0);
            html += `<td style="border:1px solid #ddd; padding:10px; text-align:center;">${total}</td>`;
        });
        html += `</tr>`;
    }
    html += `</tbody></table>`;
    container.innerHTML = html;
}

// --- 8. UI HELPERS ---
window.switchTab = function(tab) {
    document.querySelectorAll('.tab-content, .tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tab + '-tab').classList.add('active');
    document.querySelector(`[onclick*="${tab}"]`).classList.add('active');

    if (tab === 'reports') loadReports(currentUser.uid, 'weekly-reports-container');
    if (tab === 'admin') loadAdminComparativeTable();
};

window.toggleWeek = (h) => h.nextElementSibling.classList.toggle('expanded');

function setupDateSelect() {
    const s = document.getElementById('sadhana-date');
    s.innerHTML = '';
    for(let i=0; i<3; i++) {
        const d = new Date(); d.setDate(d.getDate()-i);
        const iso = d.toISOString().split('T')[0];
        const opt = document.createElement('option');
        opt.value = iso; opt.textContent = i===0 ? "Today" : i===1 ? "Yesterday" : iso;
        s.appendChild(opt);
    }
}
