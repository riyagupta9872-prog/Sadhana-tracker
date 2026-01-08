// 1. Config
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

// 2. Auth State
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            document.getElementById('user-display-name').textContent = userProfile.name;
            if (userProfile.role === 'admin') document.getElementById('admin-tab-btn').classList.remove('hidden');
            showSection('dashboard'); setupDateSelect();
        } else { showSection('profile'); }
    } else { showSection('auth'); }
});

// 3. Logic & Date setup
function setupDateSelect() {
    const s = document.getElementById('sadhana-date'); s.innerHTML = '';
    for(let i=0; i<2; i++) {
        const d = new Date(); d.setDate(d.getDate()-i);
        const iso = d.toISOString().split('T')[0];
        const opt = document.createElement('option'); opt.value = iso;
        opt.textContent = i === 0 ? "Today" : "Yesterday";
        s.appendChild(opt);
    }
    // Level-based Service visibility
    const cat = userProfile.chantingCategory || "";
    if (cat.includes('Level-3') || cat.includes('Level-4')) {
        document.getElementById('service-area').classList.remove('hidden');
    }
}

// 4. Form Submission
document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const date = document.getElementById('sadhana-date').value;
    const btn = document.getElementById('submit-btn');

    // Duplicate Check
    const check = await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(date).get();
    if (check.exists) return alert("Entry already exists for this date!");

    btn.disabled = true;

    // Convert Hrs/Mins to total minutes
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

    try {
        await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(date).set(entry);
        alert("Sadhana Saved!"); location.reload();
    } catch (err) { alert(err.message); btn.disabled = false; }
};

// 5. Navigation Utils
function showSection(id) {
    ['auth', 'profile', 'dashboard'].forEach(s => document.getElementById(s + '-section').classList.add('hidden'));
    document.getElementById(id + '-section').classList.remove('hidden');
}

window.switchTab = (t) => {
    document.querySelectorAll('.tab-content, .tab-btn').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(t + '-tab').classList.remove('hidden');
    const btn = document.querySelector(`button[onclick*="switchTab('${t}')"]`);
    if(btn) btn.classList.add('active');
};

document.getElementById('login-form').onsubmit = (e) => {
    e.preventDefault();
    auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value).catch(err => alert(err.message));
};

document.getElementById('logout-btn').onclick = () => auth.signOut();
