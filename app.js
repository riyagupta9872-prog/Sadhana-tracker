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
    if (msg) {
        el.classList.remove('hidden');
    } else {
        el.classList.add('hidden');
    }
    if (type === 'success') {
        setTimeout(() => el.classList.add('hidden'), 3000);
    }
}

function clearMessage(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        el.classList.add('hidden');
        el.textContent = '';
    }
}

function showView(viewName) {
    Object.values(views).forEach(el => { if(el) el.classList.add('hidden'); });
    if (viewName && views[viewName]) {
        views[viewName].classList.remove('hidden');
    }
}

// --- Date & Week Logic for Reports ---

function getWeekRangeInfo(dateInput) {
    const d = new Date(dateInput);
    const day = d.getDay(); // 0 is Sunday
    const sun = new Date(d);
    sun.setDate(d.getDate() - day);
    const sat = new Date(sun);
    sat.setDate(sun.getDate() + 6);

    const options = { day: '2-digit', month: 'short' };
    const dateRange = `(${sun.toLocaleDateString('en-GB', options)} - ${sat.toLocaleDateString('en-GB', options)})`;
    
    return {
        sundayStr: sun.toISOString().split('T')[0],
        saturdayStr: sat.toISOString().split('T')[0],
        displayRange: dateRange,
        sunObj: sun,
        satObj: sat
    };
}

// --- Auth State Listener ---

auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    clearMessage('auth-error');

    if (user) {
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        const profileDoc = await db.collection('users').doc(user.uid).get();

        if (profileDoc.exists) {
            userProfile = profileDoc.data();
            initializeApp(userProfile);
        } else {
            showView('profile');
        }
    } else {
        userProfile = null;
        showView('auth');
    }
});

function initializeApp(profile) {
    const nameDisplay = document.getElementById('user-display-name');
    if (nameDisplay) nameDisplay.textContent = profile.name;

    setupDateSelect();

    const adminBtn = document.getElementById('admin-tab-btn');
    if (adminBtn) {
        if (profile.role === 'admin') adminBtn.classList.remove('hidden');
        else adminBtn.classList.add('hidden');
    }

    showView('dashboard');
    switchTab('sadhana');
}

// --- Login / Logout ---

document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    auth.signInWithEmailAndPassword(email, password).catch(error => {
        showMessage('auth-error', error.message, 'error');
    });
});

document.getElementById('logout-btn').addEventListener('click', () => {
    auth.signOut();
});

// --- Profile Setup ---

document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const name = document.getElementById('profile-name').value.trim();
    const chantingCategory = document.getElementById('profile-chanting').value;

    if (!name || !chantingCategory) {
        alert("All fields are mandatory.");
        return;
    }

    const data = {
        name: name,
        chantingCategory: chantingCategory,
        email: currentUser.email,
        role: 'user',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await db.collection('users').doc(currentUser.uid).set(data);
        userProfile = data;
        initializeApp(data);
    } catch (error) {
        alert("Error saving profile: " + error.message);
    }
});

// --- Sadhana Entry & Scoring ---

function setupDateSelect() {
    const select = document.getElementById('sadhana-date');
    if (!select) return;
    select.innerHTML = '';
    const today = new Date();
    for (let i = 0; i < 3; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const option = document.createElement('option');
        option.value = dateStr;
        option.textContent = dateStr;
        select.appendChild(option);
    }
    select.value = today.toISOString().split('T')[0];
}

function getMins(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

function calculateScores(data) {
    let scores = {};
    const sleepMins = getMins(data.sleepTime);
    const targetSleep = getMins("22:30");
    if (sleepMins <= targetSleep) scores.sleep = 25;
    else if (sleepMins <= getMins("22:35")) scores.sleep = 20;
    else if (sleepMins <= getMins("22:40")) scores.sleep = 15;
    else if (sleepMins <= getMins("22:45")) scores.sleep = 10;
    else if (sleepMins <= getMins("22:50")) scores.sleep = 5;
    else if (sleepMins <= getMins("22:55")) scores.sleep = 0;
    else scores.sleep = -5;

    const wakeMins = getMins(data.wakeupTime);
    if (wakeMins <= getMins("05:05")) scores.wakeup = 25;
    else if (wakeMins <= getMins("05:10")) scores.wakeup = 20;
    else if (wakeMins <= getMins("05:15")) scores.wakeup = 15;
    else if (wakeMins <= getMins("05:20")) scores.wakeup = 10;
    else if (wakeMins <= getMins("05:25")) scores.wakeup = 5;
    else if (wakeMins <= getMins("05:30")) scores.wakeup = 0;
    else scores.wakeup = -5;

    const chantMins = getMins(data.chantingTime);
    if (chantMins <= getMins("09:00")) scores.chanting = 25;
    else if (chantMins <= getMins("09:30")) scores.chanting = 20;
    else if (chantMins <= getMins("11:00")) scores.chanting = 15;
    else if (chantMins <= getMins("14:30")) scores.chanting = 10;
    else if (chantMins <= getMins("17:00")) scores.chanting = 5;
    else if (chantMins <= getMins("19:00")) scores.chanting = 0;
    else scores.chanting = -5;

    scores.daySleep = data.daySleepMinutes <= 60 ? 25 : -5;

    const read = data.readingMinutes;
    if (read >= 30) scores.reading = 25;
    else if (read >= 25) scores.reading = 20;
    else if (read >= 20) scores.reading = 15;
    else if (read >= 15) scores.reading = 10;
    else if (read >= 10) scores.reading = 5;
    else if (read >= 5) scores.reading = 0;
    else scores.reading = -5;

    const hear = data.hearingMinutes;
    if (hear >= 30) scores.hearing = 25;
    else if (hear >= 25) scores.hearing = 20;
    else if (hear >= 20) scores.hearing = 15;
    else if (hear >= 15) scores.hearing = 10;
    else if (hear >= 10) scores.hearing = 5;
    else if (hear >= 5) scores.hearing = 0;
    else scores.hearing = -5;

    return scores;
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

    try {
        await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(date).set(entry);
        showMessage('sadhana-message', "Sadhana submitted successfully!", 'success');
        document.getElementById('sadhana-form').reset();
        setupDateSelect();
    } catch (error) {
        showMessage('sadhana-message', "Error: " + error.message, 'error');
    }
});

// --- Reports Functions ---

async function loadReports(userId = currentUser.uid, targetElementId = 'weekly-reports-container') {
    const container = document.getElementById(targetElementId);
    if (!container) return;
    container.innerHTML = 'Loading reports...';

    try {
        const snapshot = await db.collection('users').doc(userId).collection('sadhana').orderBy('submittedAt', 'asc').get();
        const entries = snapshot.docs.map(doc => ({ date: doc.id, ...doc.data() }));

        const weeks = {};
        entries.forEach(e => {
            const info = getWeekRangeInfo(e.date);
            if (!weeks[info.sundayStr]) {
                weeks[info.sundayStr] = { label: info.displayRange, data: [], weeklyTotal: 0 };
            }
            weeks[info.sundayStr].data.push(e);
            weeks[info.sundayStr].weeklyTotal += (e.totalScore || 0);
        });

        container.innerHTML = '';
        const sortedWeeks = Object.keys(weeks).sort((a, b) => b.localeCompare(a));

        sortedWeeks.forEach(weekStart => {
            const week = weeks[weekStart];
            const weekDiv = document.createElement('div');
            weekDiv.className = 'week-summary';
            weekDiv.innerHTML = `
                <div class="week-header" onclick="toggleWeek(this)">
                    <span>Week ${week.label}</span>
                    <span>Total: ${week.weeklyTotal}</span>
                    <span class="toggle-icon">&#x25BC;</span>
                </div>
                <div class="week-details expanded">
                    ${week.data.map(e => `
                        <div class="daily-entry" style="border-bottom: 1px solid #eee; padding: 5px 0;">
                            <strong>${e.date} | Daily Score: ${e.totalScore}</strong><br>
                            <small>S: ${e.scores.sleep}, W: ${e.scores.wakeup}, C: ${e.scores.chanting}, R: ${e.scores.reading}, H: ${e.scores.hearing}, D: ${e.scores.daySleep}</small>
                        </div>
                    `).join('')}
                    <div style="margin-top:10px; font-weight:bold; color:#2c3e50;">Weekly Total Score: ${week.weeklyTotal}</div>
                </div>
            `;
            container.appendChild(weekDiv);
        });
    } catch (error) {
        container.innerHTML = `<p class="message error">Error: ${error.message}</p>`;
    }
}

// --- Admin Functions ---

async function loadAdminData() {
    const listContainer = document.getElementById('admin-users-list');
    if (!listContainer) return;
    listContainer.innerHTML = 'Loading Users...';

    try {
        const usersSnap = await db.collection('users').get();
        listContainer.innerHTML = '';
        const usersList = document.createElement('ul');
        usersList.className = 'admin-user-list';

        usersSnap.forEach(doc => {
            const u = doc.data();
            const userId = doc.id;
            const userCard = document.createElement('li');
            userCard.className = 'admin-user-card-item';
            userCard.innerHTML = `
                <div><strong>${u.name || 'N/A'}</strong> (${u.email})</div>
                <div>
                    <button class="admin-action-btn" onclick="displayUserSadhanaReport('${userId}', '${u.name}')">View Sadhana</button>
                </div>
            `;
            usersList.appendChild(userCard);
        });
        listContainer.appendChild(usersList);
    } catch (error) {
        listContainer.innerHTML = 'Error loading users.';
    }
}

async function displayUserSadhanaReport(userId, userName) {
    const adminTabContent = document.getElementById('admin-tab');
    let userReportDisplay = document.getElementById(`admin-user-report-${userId}`);
    if (!userReportDisplay) {
        userReportDisplay = document.createElement('div');
        userReportDisplay.id = `admin-user-report-${userId}`;
        userReportDisplay.innerHTML = `<h4>Report for ${userName} <button onclick="this.parentNode.parentNode.remove()">Close</button></h4><div id="user-reports-container-${userId}"></div><hr>`;
        adminTabContent.appendChild(userReportDisplay);
    }
    loadReports(userId, `user-reports-container-${userId}`);
}

async function loadAdminComparativeTable() {
    const container = document.getElementById('admin-comparative-reports-container');
    if (!container) return;
    container.innerHTML = '<p>Calculating Weekly Scores...</p>';

    try {
        const usersSnap = await db.collection('users').get();
        const weeks = [];
        for (let i = 0; i < 4; i++) {
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() - (i * 7));
            weeks.push(getWeekRangeInfo(targetDate));
        }
        weeks.reverse();

        let html = `
            <table style="width:100%; border-collapse: collapse; margin-top: 20px; background: white;">
                <thead>
                    <tr style="background-color: #f2f2f2;">
                        <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Devotee Name</th>
                        ${weeks.map((w, index) => `
                            <th style="border: 1px solid #ddd; padding: 12px; text-align: center;">
                                Week ${4 - index}<br>
                                <span style="font-weight: normal; font-size: 0.85em;">${w.displayRange}</span>
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody>
        `;

        for (const userDoc of usersSnap.docs) {
            const userData = userDoc.data();
            html += `<tr><td style="border: 1px solid #ddd; padding: 10px;"><strong>${userData.name || 'Unknown'}</strong></td>`;
            const sadhanaSnap = await db.collection('users').doc(userDoc.id).collection('sadhana').get();
            const entries = sadhanaSnap.docs.map(d => ({ date: d.id, ...d.data() }));

            weeks.forEach(w => {
                const weeklyTotal = entries
                    .filter(e => e.date >= w.sundayStr && e.date <= w.saturdayStr)
                    .reduce((sum, e) => sum + (e.totalScore || 0), 0);
                html += `<td style="border: 1px solid #ddd; padding: 10px; text-align: center;">${weeklyTotal}</td>`;
            });
            html += `</tr>`;
        }
        html += `</tbody></table>`;
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = 'Error generating table.';
    }
}

// --- Global UI Switches ---

window.switchTab = function(tabName) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    const btn = document.querySelector(`.tab-btn[onclick*="switchTab('${tabName}')"]`);
    if(btn) btn.classList.add('active');
    const tab = document.getElementById(tabName + '-tab');
    if(tab) tab.classList.add('active');

    if (tabName === 'reports' && currentUser) {
        loadReports(currentUser.uid, 'weekly-reports-container');
    } else if (tabName === 'admin' && currentUser && userProfile?.role === 'admin') {
        loadAdminData();
        loadAdminComparativeTable();
    }
};

window.toggleWeek = function(header) {
    const details = header.nextElementSibling;
    details.classList.toggle('expanded');
    const icon = header.querySelector('.toggle-icon');
    if (icon) icon.innerHTML = details.classList.contains('expanded') ? '&#x25BC;' : '&#x25B6;';
};
