// Firebase Configuration
// This is your unique project configuration provided by you.
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
    // This catch block helps prevent the app from crashing if Firebase keys are missing or incorrect
}

const auth = firebase.auth();
const db = firebase.firestore();

// State variables to keep track of the current user and their profile
let currentUser = null;
let userProfile = null;

// References to main sections of the HTML for easy showing/hiding
const views = {
    auth: document.getElementById('auth-section'),
    profile: document.getElementById('profile-section'),
    dashboard: document.getElementById('dashboard-section')
};

// --- Utility Functions for Messages and View Management ---

// Displays a temporary message to the user
function showMessage(elementId, msg, type = 'success') {
    const el = document.getElementById(elementId);
    el.textContent = msg;
    el.className = `message ${type}`; // Apply CSS classes for styling (success/error)
    if (msg) {
        el.classList.remove('hidden'); // Show the message element
    } else {
        el.classList.add('hidden'); // Hide if message is empty
    }
    // Automatically hide success/info messages after 3 seconds
    if (type === 'success') {
        setTimeout(() => el.classList.add('hidden'), 3000);
    }
}

// Clears and hides a message element
function clearMessage(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        el.classList.add('hidden');
        el.textContent = '';
    }
}

// Controls which main section (login, profile setup, dashboard) is visible
function showView(viewName) {
    // Hide all main sections first
    Object.values(views).forEach(el => el.classList.add('hidden'));
    // Show only the requested section
    if (viewName && views[viewName]) {
        views[viewName].classList.remove('hidden');
    }
}

// --- Firebase Authentication State Listener ---

// This function runs whenever the user's login status changes
auth.onAuthStateChanged(async (user) => {
    currentUser = user; // Update the global currentUser variable

    clearMessage('auth-error'); // Clear any previous login errors

    if (user) {
        // User is logged in
        // Set session persistence to 'local' so the user stays logged in
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

        // Fetch the user's profile from Firestore
        const profileDoc = await db.collection('users').doc(user.uid).get();

        if (profileDoc.exists) {
            // If profile exists, load it and initialize the app dashboard
            userProfile = profileDoc.data();
            initializeApp(userProfile);
        } else {
            // If no profile, show the profile setup screen
            showView('profile');
        }
    } else {
        // User is logged out
        userProfile = null; // Clear the user profile
        showView('auth'); // Show the login/signup screen
    }
});

// --- Initialize App After Login/Profile Setup ---

// Sets up the dashboard UI based on the user's profile
function initializeApp(profile) {
    document.getElementById('user-display-name').textContent = profile.name;

    // Prepare the date selection dropdown for Sadhana entry
    setupDateSelect();

    // Show/hide the Admin tab based on the user's role
    if (profile.role === 'admin') {
        document.getElementById('admin-tab-btn').classList.remove('hidden');
    } else {
        document.getElementById('admin-tab-btn').classList.add('hidden');
    }

    showView('dashboard'); // Show the main dashboard
    switchTab('sadhana'); // Default to the Sadhana Entry tab
}

// --- Login / Logout Functions ---

// Handles user login when the form is submitted
document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault(); // Prevent default form submission behavior

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    auth.signInWithEmailAndPassword(email, password)
        .catch(error => {
            // Display any login errors to the user
            showMessage('auth-error', error.message, 'error');
        });
});

// Handles user logout when the logout button is clicked
document.getElementById('logout-btn').addEventListener('click', () => {
    auth.signOut(); // Sign out the current user
    // The onAuthStateChanged listener will automatically handle redirecting to the login screen
});

// --- Profile Setup Functions ---

// Handles saving the user's profile information
document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!currentUser) return; // Ensure a user is logged in

    const name = document.getElementById('profile-name').value.trim();
    const chantingCategory = document.getElementById('profile-chanting').value;

    // Client-side validation for profile fields
    if (!name) {
        alert("Full Name is mandatory.");
        return;
    }
    if (!chantingCategory) {
        alert("Chanting Category is mandatory.");
        return;
    }

    // Prepare data for Firestore
    const data = {
        name: name,
        chantingCategory: chantingCategory,
        email: currentUser.email,
        role: 'user', // Default role for new users
        createdAt: firebase.firestore.FieldValue.serverTimestamp(), // Timestamp when created
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()  // Timestamp for updates
    };

    try {
        // Save the profile data to Firestore in the 'users' collection
        await db.collection('users').doc(currentUser.uid).set(data);
        userProfile = data; // Update local user profile state
        initializeApp(data); // Re-initialize app with new profile
    } catch (error) {
        console.error("Error saving profile:", error);
        alert("Failed to save profile: " + error.message);
    }
});

// --- Sadhana Entry Functions ---

// Populates the date selection dropdown with actual dates (YYYY-MM-DD)
function setupDateSelect() {
    const select = document.getElementById('sadhana-date');
    select.innerHTML = ''; // Clear existing options

    const today = new Date();
    // Loop to create options for Today, Yesterday, Day Before Yesterday
    for (let i = 0; i < 3; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i); // Subtract days
        const dateStr = d.toISOString().split('T')[0]; // Format as YYYY-MM-DD

        const option = document.createElement('option');
        option.value = dateStr;
        option.textContent = dateStr; // Only show the date in YYYY-MM-DD format
        select.appendChild(option);
    }
    // Set 'Today's date as the default selected option
    select.value = today.toISOString().split('T')[0];
}

// Handles submitting the daily sadhana entry
document.getElementById('sadhana-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    // Get values from the form inputs
    const date = document.getElementById('sadhana-date').value;
    const sleepTime = document.getElementById('sleep-time').value;
    const wakeupTime = document.getElementById('wakeup-time').value;
    const chantingTime = document.getElementById('chanting-time').value;
    const readingMinutes = parseInt(document.getElementById('reading-minutes').value);
    const hearingMinutes = parseInt(document.getElementById('hearing-minutes').value);
    const daySleepMinutes = parseInt(document.getElementById('day-sleep-minutes').value);

    // Client-side validation for sadhana fields
    if (!date || !sleepTime || !wakeupTime || !chantingTime || isNaN(readingMinutes) || isNaN(hearingMinutes) || isNaN(daySleepMinutes)) {
        showMessage('sadhana-message', "All Sadhana fields are mandatory.", 'error');
        return;
    }
    if (readingMinutes < 0 || hearingMinutes < 0 || daySleepMinutes < 0) {
        showMessage('sadhana-message', "Minutes cannot be negative.", 'error');
        return;
    }

    // Create the sadhana entry object
    const entry = {
        sleepTime: sleepTime,
        wakeupTime: wakeupTime,
        chantingTime: chantingTime,
        readingMinutes: readingMinutes,
        hearingMinutes: hearingMinutes,
        daySleepMinutes: daySleepMinutes,
        submittedAt: firebase.firestore.FieldValue.serverTimestamp(), // Timestamp of submission
        scores: {}, // Placeholder for calculated scores
        totalScore: 0 // Placeholder for total daily score
    };

    // Calculate scores using the predefined scoring logic
    entry.scores = calculateScores(entry);
    entry.totalScore = Object.values(entry.scores).reduce((a, b) => a + b, 0); // Sum of all scores

    try {
        // Save the sadhana entry to Firestore in the user's 'sadhana' subcollection
        await db.collection('users').doc(currentUser.uid)
            .collection('sadhana').doc(date).set(entry);

        showMessage('sadhana-message', "Sadhana submitted successfully!", 'success');
        document.getElementById('sadhana-form').reset(); // Clear the form
        setupDateSelect(); // Reset date selection to 'Today'
        loadReports(currentUser.uid, 'weekly-reports-container'); // Refresh reports
    } catch (error) {
        console.error("Error submitting sadhana:", error);
        showMessage('sadhana-message', "Error submitting data: " + error.message, 'error');
    }
});

// --- Scoring Logic (This part is exactly as you requested) ---

// Helper function to convert "HH:MM" time string to minutes from midnight
function getMins(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

// Calculates scores for each sadhana activity based on provided rules
function calculateScores(data) {
    let scores = {};

    // Sleep Time (Night) scoring
    const sleepMins = getMins(data.sleepTime);
    const targetSleep = getMins("22:30"); // 10:30 PM
    if (sleepMins <= targetSleep) scores.sleep = 25;
    else if (sleepMins <= getMins("22:35")) scores.sleep = 20;
    else if (sleepMins <= getMins("22:40")) scores.sleep = 15;
    else if (sleepMins <= getMins("22:45")) scores.sleep = 10;
    else if (sleepMins <= getMins("22:50")) scores.sleep = 5;
    else if (sleepMins <= getMins("22:55")) scores.sleep = 0;
    else scores.sleep = -5;

    // Wake-up Time scoring
    const wakeMins = getMins(data.wakeupTime);
    const targetWake = getMins("05:05"); // 05:05 AM
    if (wakeMins <= targetWake) scores.wakeup = 25;
    else if (wakeMins <= getMins("05:10")) scores.wakeup = 20;
    else if (wakeMins <= getMins("05:15")) scores.wakeup = 15;
    else if (wakeMins <= getMins("05:20")) scores.wakeup = 10;
    else if (wakeMins <= getMins("05:25")) scores.wakeup = 5;
    else if (wakeMins <= getMins("05:30")) scores.wakeup = 0;
    else scores.wakeup = -5;

    // Chanting Completion Time scoring
    const chantMins = getMins(data.chantingTime);
    if (chantMins <= getMins("09:00")) scores.chanting = 25;
    else if (chantMins <= getMins("09:30")) scores.chanting = 20;
    else if (chantMins <= getMins("11:00")) scores.chanting = 15;
    else if (chantMins <= getMins("14:30")) scores.chanting = 10; // 02:30 PM
    else if (chantMins <= getMins("17:00")) scores.chanting = 5;  // 05:00 PM
    else if (chantMins <= getMins("19:00")) scores.chanting = 0;  // 07:00 PM
    else scores.chanting = -5;

    // Day Sleep scoring
    scores.daySleep = data.daySleepMinutes <= 60 ? 25 : -5;

    // Reading (Pathan) scoring
    const read = data.readingMinutes;
    if (read >= 30) scores.reading = 25;
    else if (read >= 25) scores.reading = 20;
    else if (read >= 20) scores.reading = 15;
    else if (read >= 15) scores.reading = 10;
    else if (read >= 10) scores.reading = 5;
    else if (read >= 5) scores.reading = 0;
    else scores.reading = -5;

    // Hearing scoring
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


// --- Reports Functions ---

// Helper to get the ISO week number for a given date
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); // Set to nearest Thursday to determine week
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// Helper to get a date string in YYYY-MM-DD format
function getDateString(date) {
    return date.toISOString().split('T')[0];
}

// Loads and renders sadhana reports for a given user
async function loadReports(userId = currentUser.uid, targetElementId = 'weekly-reports-container') {
    const container = document.getElementById(targetElementId);
    if (!container) return; // Exit if target element not found
    container.innerHTML = 'Loading reports...'; // Display loading message

    try {
        // Fetch all sadhana entries for the user, ordered by date
        const snapshot = await db.collection('users').doc(userId)
            .collection('sadhana').orderBy('submittedAt', 'asc').get();

        const sadhanaEntries = snapshot.docs.map(doc => ({ date: doc.id, ...doc.data() }));

        // Process entries to include 'NR' (Not Received) for missing days
        const processedEntries = processSadhanaForReports(sadhanaEntries);

        const dataByWeek = {};
        processedEntries.forEach(entry => {
            const d = new Date(entry.date);
            const weekStr = getWeekNumber(d);

            if (!dataByWeek[weekStr]) {
                dataByWeek[weekStr] = [];
            }
            dataByWeek[weekStr].push(entry);
        });

        container.innerHTML = ''; // Clear loading message

        if (Object.keys(dataByWeek).length === 0) {
            container.innerHTML = '<p>No sadhana entries yet.</p>';
            return;
        }

        // Sort weeks from newest to oldest
        const sortedWeeks = Object.keys(dataByWeek).sort((a, b) => b.localeCompare(a));

        const todayWeekStr = getWeekNumber(new Date());

        // Render current week (if exists)
        if (dataByWeek[todayWeekStr]) {
            const currentWeekData = dataByWeek[todayWeekStr];
            container.innerHTML += `<h3>Current Week (${todayWeekStr})</h3>`;
            container.innerHTML += renderWeeklySummary(todayWeekStr, currentWeekData);
        }

        // Render previous weeks as collapsed sections
        const previousWeeks = sortedWeeks.filter(week => week !== todayWeekStr);
        if (previousWeeks.length > 0) {
            container.innerHTML += `<h3>Previous Weeks</h3>`;
            previousWeeks.forEach(weekStr => {
                const weekData = dataByWeek[weekStr];
                container.innerHTML += renderWeeklySummary(weekStr, weekData, true); // 'true' means collapsed
            });
        }

    } catch (error) {
        console.error("Error loading reports:", error);
        container.innerHTML = `<p class="message error">Error loading reports: ${error.message}</p>`;
    }
}

// Function to calculate and insert "NR" entries for missing sadhana days
function processSadhanaForReports(existingEntries) {
    let processedData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of day

    // Determine the earliest date we need to consider
    let earliestDate = today;
    if (existingEntries.length > 0) {
        earliestDate = new Date(existingEntries[0].date); // entries are already sorted ascending
        earliestDate.setHours(0, 0, 0, 0);
    }

    // Loop through each day from the earliest sadhana entry (or today) up to today
    for (let d = new Date(earliestDate); d <= today; d.setDate(d.getDate() + 1)) {
        const dateStr = getDateString(d);
        const existingEntry = existingEntries.find(e => e.date === dateStr);

        if (existingEntry) {
            processedData.push(existingEntry);
        } else {
            // No entry for this date, check if it should be marked as NR
            const diffDays = Math.floor((today - d) / (1000 * 60 * 60 * 24)); // Days difference from today

            if (diffDays >= 2) { // If the date is 2 or more days ago, mark as NR
                processedData.push({
                    date: dateStr,
                    isNR: true, // Flag for Not Received
                    totalScore: -30, // 6 activities * -5 marks
                    scores: {
                        sleep: -5, wakeup: -5, chanting: -5,
                        reading: -5, hearing: -5, daySleep: -5
                    }
                });
            } else {
                // For today or yesterday, if not submitted, it's not yet NR, so score is 0
                processedData.push({
                    date: dateStr,
                    notSubmitted: true,
                    totalScore: 0,
                    scores: {
                        sleep: 0, wakeup: 0, chanting: 0,
                        reading: 0, hearing: 0, daySleep: 0
                    }
                });
            }
        }
    }
    return processedData;
}

// Renders the HTML for a weekly summary of sadhana reports
function renderWeeklySummary(weekStr, entries, collapsed = false) {
    let weekTotal = 0;
    entries.forEach(entry => weekTotal += (entry.totalScore || 0)); // Calculate total score for the week

    const isLowScore = weekTotal < 20; // Check if weekly total is below 20 for highlighting

    // Sort daily entries by date for consistent display
    const dailyEntriesHtml = entries.sort((a,b) => a.date.localeCompare(b.date)).map(e => {
        let dailyScoreHtml = '';
        if (e.isNR) {
             dailyScoreHtml = `All activities: <span class="score-negative">-5 (NR)</span>`;
        } else if (e.notSubmitted) {
            dailyScoreHtml = `No entry for this day.`;
        } else {
            // Display individual scores for submitted entries
            dailyScoreHtml = `
                Sleep: ${e.scores.sleep}, Wakeup: ${e.scores.wakeup}, Chanting: ${e.scores.chanting},
                Reading: ${e.scores.reading}, Hearing: ${e.scores.hearing}, Day Sleep: ${e.scores.daySleep}
            `;
        }

        return `
            <div class="daily-entry">
                <span>${e.date}</span>
                <span class="${e.totalScore < 0 ? 'score-negative' : ''}">Daily Total: ${e.totalScore}</span>
                <span>${dailyScoreHtml}</span>
            </div>
        `;
    }).join(''); // Join all daily entry HTML strings

    return `
        <div class="week-summary">
            <div class="week-header ${isLowScore ? 'low-score' : ''}" onclick="toggleWeek(this)">
                <span>Week ${weekStr}</span>
                <span>Total Score: ${weekTotal}</span>
                <span class="toggle-icon">${collapsed ? '&#x25B6;' : '&#x25BC;'}</span>
            </div>
            <div class="week-details ${collapsed ? '' : 'expanded'}">
                ${dailyEntriesHtml}
            </div>
        </div>
    `;
}

// --- Admin Functions ---

// Loads and displays all user information in the Admin tab
async function loadAdminData() {
    const listContainer = document.getElementById('admin-users-list');
    listContainer.innerHTML = 'Loading Users...'; // Display loading message

    try {
        const usersSnap = await db.collection('users').get(); // Fetch all user profiles
        listContainer.innerHTML = ''; // Clear loading message

        if (usersSnap.empty) {
            listContainer.innerHTML = '<p>No users found.</p>';
            return;
        }

        const usersList = document.createElement('ul');
        usersList.className = 'admin-user-list';

        usersSnap.forEach(doc => {
            const u = doc.data();
            const userId = doc.id;
            const isCurrentUser = userId === currentUser.uid; // Check if this is the currently logged-in admin

            const userCard = document.createElement('li');
            userCard.className = 'admin-user-card-item';
            userCard.innerHTML = `
                <div>
                    <strong>${u.name || 'N/A'}</strong> (${u.email})<br>
                    Category: ${u.chantingCategory || 'N/A'}<br>
                    Role: ${u.role || 'user'}
                </div>
                <div>
                    <button class="admin-action-btn view-user-sadhana-btn" data-uid="${userId}">View Sadhana</button>
                    ${!isCurrentUser ? // Don't allow admin to change their own role
                        `<button class="admin-action-btn toggle-admin-role-btn" data-uid="${userId}" data-current-role="${u.role}">
                            ${u.role === 'admin' ? 'Revoke Admin' : 'Make Admin'}
                        </button>`
                        : ''}
                </div>
            `;
            usersList.appendChild(userCard);
        });
        listContainer.appendChild(usersList);

        // Add event listener for buttons within the admin user list
        listContainer.addEventListener('click', async (event) => {
            const target = event.target;
            const userId = target.dataset.uid;

            if (!userId) return; // Ensure a user ID is available

            if (target.classList.contains('toggle-admin-role-btn')) {
                const currentRole = target.dataset.currentRole;
                const newRole = currentRole === 'admin' ? 'user' : 'admin';
                await assignUserRole(userId, newRole);
                loadAdminData(); // Refresh the admin list after role change
            } else if (target.classList.contains('view-user-sadhana-btn')) {
                // Get the user's name or email to display in the report header
                const userName = usersSnap.docs.find(d => d.id === userId)?.data()?.name || usersSnap.docs.find(d => d.id === userId)?.data()?.email;
                displayUserSadhanaReport(userId, userName);
            }
        });

    } catch (error) {
        console.error("Error loading admin data:", error);
        listContainer.innerHTML = `<p class="message error">Error loading admin data: ${error.message}</p>`;
    }
}

// Allows an admin to assign or revoke the 'admin' role for another user
async function assignUserRole(userId, role) {
    try {
        await db.collection('users').doc(userId).update({ role: role });
        alert(`User role updated to ${role} for user ID: ${userId}.`);
    } catch (error) {
        console.error("Error updating user role:", error);
        alert("Failed to update user role: " + error.message);
    }
}

// Displays the sadhana report for a specific user within the admin tab
async function displayUserSadhanaReport(userId, userName) {
    const adminTabContent = document.getElementById('admin-tab');
    let userReportDisplay = document.getElementById(`admin-user-report-${userId}`);

    // If the report container doesn't exist, create it
    if (!userReportDisplay) {
        userReportDisplay = document.createElement('div');
        userReportDisplay.id = `admin-user-report-${userId}`;
        userReportDisplay.className = 'admin-individual-report-container';
        userReportDisplay.innerHTML = `
            <h4>Sadhana Report for ${userName || 'User'} <button onclick="this.parentNode.parentNode.remove()">Close</button></h4>
            <div id="user-reports-container-${userId}"></div>
            <hr/>
        `;
        adminTabContent.appendChild(userReportDisplay);
    } else {
        // If it exists, scroll to it
        userReportDisplay.scrollIntoView({ behavior: 'smooth' });
    }

    // Load reports into the newly created/found container
    loadReports(userId, `user-reports-container-${userId}`);
}

// --- General UI Utilities ---

// Switches between tabs (Sadhana, Reports, Admin)
window.switchTab = function(tabName) {
    // Remove 'active' class from all tab buttons and content
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    // Add 'active' class to the selected tab button and content
    document.querySelector(`.tab-btn[onclick*="switchTab('${tabName}')"]`).classList.add('active');
    document.getElementById(tabName + '-tab').classList.add('active');

    // Load content dynamically when a tab is switched
    if (tabName === 'reports' && currentUser) {
        loadReports(currentUser.uid, 'weekly-reports-container');
    } else if (tabName === 'admin' && currentUser && userProfile && userProfile.role === 'admin') {
        loadAdminData();
    }
};

// Toggles the visibility of weekly report details
window.toggleWeek = function(header) {
    const details = header.nextElementSibling; // The div containing daily entries
    details.classList.toggle('expanded');
    const icon = header.querySelector('.toggle-icon');
    if (details.classList.contains('expanded')) {
        icon.innerHTML = '&#x25BC;'; // Down arrow
    } else {
        icon.innerHTML = '&#x25B6;'; // Right arrow
    }
};

// Initial setup on page load (handled by onAuthStateChanged, which calls initializeApp)
document.addEventListener('DOMContentLoaded', () => {
    // No direct action needed here as onAuthStateChanged handles the initial view
});
