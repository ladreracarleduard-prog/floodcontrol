/**
 * FloodGuard - Full Functional Implementation
 * Handles: Auth, Persistence, Real-time Simulation, Navigation, and Hardware Logic
 */

// --- DOM ELEMENTS ---
const statusTime = document.getElementById('status-time');
const userGreeting = document.getElementById('user-greeting');
const userNameDisplay = document.getElementById('user-name-display');
const currentDateEl = document.getElementById('current-date');
const dashHeader = document.querySelector('.dash-header');
const statusTitle = document.getElementById('status-title');
const statusDesc = document.getElementById('status-desc');
const alertPanelText = document.getElementById('dash-alert-text');
const alertPanelIcon = document.querySelector('#dash-alert-panel i');
const activityList = document.getElementById('activity-list');
const alertModal = document.getElementById('alert-modal');
const alertText = document.getElementById('alert-text');

// Auth
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

// Settings
const setAutoValve = document.getElementById('set-auto-valve');
const setBuzzer = document.getElementById('set-buzzer');
const setLed = document.getElementById('set-led');
const setNotifs = document.getElementById('set-notifs');
const wifiNameDisplay = document.getElementById('wifi-name-display');

// Zones Config
const zones = {
    kitchen: { val: 0, el: document.getElementById('s-val-kitchen'), card: document.getElementById('card-kitchen') },
    bathroom: { val: 0, el: document.getElementById('s-val-bathroom'), card: document.getElementById('card-bathroom') },
    laundry: { val: 0, el: document.getElementById('s-val-laundry'), card: document.getElementById('card-laundry') },
    basement: { val: 0, el: document.getElementById('s-val-basement'), card: document.getElementById('card-basement') }
};

// --- APP STATE ---
let simulationInterval = null;
let isMuted = false;
let valveOpen = true;
let systemActive = true;
let currentOverallStatus = 'LOW';
let activeUser = null;
let chartInstance = null;
let socket = null;
let hardwareConnected = false;
let deviceIP = "192.168.4.1";

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    checkAuth();
    loadLogs();
    updateClockAndDate();
    setInterval(updateClockAndDate, 1000);
    initChart();
    populateHistoryTable();
    initSettings();
    updateWiFiStatus();
});

function initAuth() {
    const lForm = document.getElementById('login-form');
    const rForm = document.getElementById('register-form');

    if(lForm) {
        lForm.addEventListener('submit', (e) => {
            e.preventDefault();
            console.log("Login attempt...");
            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-password').value;
            const staySignedIn = document.getElementById('login-stay-signed-in')?.checked;
            const loginBtn = e.target.querySelector('button[type="submit"]');
            
            // Show loading state
            const originalText = loginBtn.innerHTML;
            loginBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Logging in...';
            loginBtn.disabled = true;

            setTimeout(() => {
                const users = JSON.parse(localStorage.getItem('floodguard_users') || '[]');
                const user = users.find(u => u.email === email && u.pass === pass);
                
                if ((email === 'admin@home.com' && pass === 'password123') || user) {
                    activeUser = user || { name: 'Admin User', email };
                    console.log("Login success for:", activeUser.name);
                    
                    if (staySignedIn) {
                        localStorage.setItem('floodguard_session', JSON.stringify(activeUser));
                        sessionStorage.removeItem('floodguard_session');
                    } else {
                        sessionStorage.setItem('floodguard_session', JSON.stringify(activeUser));
                        localStorage.removeItem('floodguard_session');
                    }
                    
                    showToast(`Welcome back, ${activeUser.name.split(' ')[0]}!`, 'success', 'fa-user-check');
                    switchView('view-dashboard');
                    startSimulation();
                } else {
                    console.error("Login failed: Invalid credentials");
                    showToast('Invalid credentials. Hint: password123', 'error', 'fa-lock');
                    loginBtn.innerHTML = originalText;
                    loginBtn.disabled = false;
                }
            }, 1000);
        });
    }

    if(rForm) {
        rForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('reg-name').value;
            const email = document.getElementById('reg-email').value;
            const pass = document.getElementById('reg-password').value;
            
            const users = JSON.parse(localStorage.getItem('floodguard_users') || '[]');
            if (users.find(u => u.email === email)) {
                showToast('Email already registered.', 'error');
                return;
            }
            
            const newUser = { name, email, pass };
            users.push(newUser);
            localStorage.setItem('floodguard_users', JSON.stringify(users));
            
            activeUser = newUser;
            localStorage.setItem('floodguard_session', JSON.stringify(activeUser));
            sessionStorage.removeItem('floodguard_session');
            
            showToast(`Account created! Welcome, ${name}`, 'success', 'fa-user-plus');
            switchView('view-dashboard');
            startSimulation();
        });
    }

    // Password visibility toggle
    const togglePass = document.getElementById('toggle-login-password');
    const passInput = document.getElementById('login-password');
    if(togglePass && passInput) {
        togglePass.addEventListener('click', () => {
            const isPass = passInput.type === 'password';
            passInput.type = isPass ? 'text' : 'password';
            togglePass.className = `fa-solid ${isPass ? 'fa-eye' : 'fa-eye-slash'} toggle-password`;
        });
    }
}

function updateClockAndDate() {
    const now = new Date();
    if(statusTime) statusTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (currentDateEl) {
        currentDateEl.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    }
    
    if (userGreeting) {
        const hour = now.getHours();
        if (hour < 12) userGreeting.textContent = 'Good Morning,';
        else if (hour < 18) userGreeting.textContent = 'Good Day,'; // As requested
        else userGreeting.textContent = 'Good Evening,';
    }
}

// --- AUTH LOGIC ---
function checkAuth() {
    const session = localStorage.getItem('floodguard_session') || sessionStorage.getItem('floodguard_session');
    if (session) {
        activeUser = JSON.parse(session);
        if(userNameDisplay) userNameDisplay.textContent = activeUser.name.split(' ')[0];
        switchView('view-dashboard');
        startSimulation();
    } else {
        switchView('view-login');
    }
}


// --- NAVIGATION ---
function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(viewId);
    if(view) view.classList.add('active');
    
    const bottomNav = document.getElementById('main-bottom-nav');
    if (viewId === 'view-login' || viewId === 'view-register') {
        if (bottomNav) bottomNav.style.display = 'none';
    } else {
        if (bottomNav) bottomNav.style.display = 'block';
    }
    
    const lightViews = ['view-register', 'view-logs', 'view-alerts', 'view-settings', 'view-device'];
    const sb = document.querySelector('.status-bar');
    if(sb) {
        if (lightViews.includes(viewId)) sb.style.color = '#0f172a';
        else sb.style.color = 'white';
    }
}

function switchTab(tabName) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-tab') === tabName) item.classList.add('active');
    });
    
    const viewMap = {
        'Home': 'view-dashboard',
        'Logs': 'view-logs',
        'Alerts': 'view-alerts',
        'Settings': 'view-settings',
        'Device': 'view-device'
    };
    switchView(viewMap[tabName]);
}

// --- TOAST NOTIFICATIONS ---
function showToast(message, type = 'success', icon = null) {
    // Respect notifications setting
    if (setNotifs && !setNotifs.checked && type !== 'error') return;

    const container = document.getElementById('toast-container');
    if(!container) return;
    
    let defaultIcon = 'fa-circle-check';
    if(type === 'error') defaultIcon = 'fa-circle-exclamation';
    if(type === 'info') defaultIcon = 'fa-circle-info';
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="fa-solid ${icon || defaultIcon}"></i>
        <div class="toast-content">
            <h4>${type.charAt(0).toUpperCase() + type.slice(1)}</h4>
            <p>${message}</p>
        </div>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

// --- SIMULATION LOGIC ---
function startSimulation() {
    if (simulationInterval) return;
    // System started for the first time
    if (!localStorage.getItem('floodguard_logs')) {
        logActivity('System Initialized', 'FloodGuard monitoring service started', 'info', 'fa-shield-check');
    }
    
    simulationInterval = setInterval(() => {
        simulateData();
    }, 3000);
    simulateData(); // Initial call
}

function simulateData() {
    if (!systemActive) return;

    let maxSeverity = 0;
    let dangerZones = [];
    let avgVal = 0;
    
    // Parse threshold from settings UI
    const thresholdText = document.getElementById('set-threshold-val')?.textContent || "Medium (60%)";
    const threshold = parseInt(thresholdText.match(/\d+/)[0]);

    Object.keys(zones).forEach(key => {
        let zone = zones[key];
        
        // Random leak initiation
        if (zone.val === 0 && Math.random() < 0.05) {
            zone.val = 5; 
        } 
        
        if (zone.val > 0) {
            if (valveOpen) {
                // Rapid rise if valve is open
                zone.val += Math.floor(Math.random() * 12) + 4;
            } else {
                // Gradual decrease if valve is closed
                zone.val = Math.max(0, zone.val - 12);
            }
        }
        
        zone.val = Math.min(100, zone.val);
        avgVal += zone.val;
        
        let statusStr = 'LOW';
        let severity = 0;
        
        if (zone.val >= threshold) {
            statusStr = 'HIGH';
            severity = 2;
            dangerZones.push(key.charAt(0).toUpperCase() + key.slice(1));
        } else if (zone.val >= 15) {
            statusStr = 'NORMAL';
            severity = 1;
        }
        
        if (severity > maxSeverity) maxSeverity = severity;
        updateZoneUI(zone, statusStr);
    });

    avgVal = avgVal / 4;
    updateChart(avgVal);
    updateDeviceControls(zones['kitchen'].val);
    updateOverallStatus(maxSeverity, dangerZones);
}

function updateZoneUI(zone, statusStr) {
    if(!zone.el) return;
    
    // Requirement: Kitchen -> 🟢 Safe / 🔴 Leak
    if (statusStr === 'HIGH') {
        zone.el.innerHTML = '🔴 Leak';
        zone.el.style.color = '#ef4444';
        if(zone.card) zone.card.style.borderColor = '#ef4444';
    } else if (statusStr === 'NORMAL') {
        zone.el.innerHTML = '🟢 Normal';
        zone.el.style.color = '#10b981';
        if(zone.card) zone.card.style.borderColor = '#10b981';
    } else {
        zone.el.innerHTML = '🟢 Safe';
        zone.el.style.color = '#3b82f6';
        if(zone.card) zone.card.style.borderColor = 'transparent';
    }
}

function updateOverallStatus(severity, dangerZones) {
    if(!statusTitle) return;
    const statusCardOuter = document.querySelector('.status-card-outer');

    if (severity === 0) {
        if (currentOverallStatus !== 'LOW') {
            if(statusCardOuter) statusCardOuter.style.background = 'var(--gradient-safe)';
            statusTitle.textContent = 'LOW';
            statusDesc.textContent = 'All sensors within safe limits';
            if(alertPanelText) {
                alertPanelText.textContent = 'No Alerts';
                alertPanelIcon.className = 'fa-solid fa-check-circle text-blue';
                alertPanelIcon.style.color = '#3b82f6';
            }
            currentOverallStatus = 'LOW';
            if(alertModal) alertModal.classList.remove('show');
            isMuted = false;
        }
    } else if (severity === 1) {
        if (currentOverallStatus !== 'NORMAL') {
            if(statusCardOuter) statusCardOuter.style.background = 'var(--gradient-blue)';
            statusTitle.textContent = 'NORMAL';
            statusDesc.textContent = 'Monitoring elevated levels';
            if(alertPanelText) {
                alertPanelText.textContent = 'Minor Water Detected';
                alertPanelIcon.className = 'fa-solid fa-circle-info text-green';
                alertPanelIcon.style.color = '#10b981';
            }
            currentOverallStatus = 'NORMAL';
            logActivity('Warning', 'Sensors detected trace amounts of water', 'warning', 'fa-triangle-exclamation');
        }
    } else if (severity === 2) {
        if(statusCardOuter) statusCardOuter.style.background = 'var(--gradient-danger)';
        statusTitle.textContent = 'HIGH';
        statusDesc.textContent = `Critical Leak: ${dangerZones.join(', ')}`;
        if(alertPanelText) {
            alertPanelText.textContent = `⚠ Leak in ${dangerZones.join(', ')}`;
            alertPanelIcon.className = 'fa-solid fa-triangle-exclamation text-red';
            alertPanelIcon.style.color = '#ef4444';
        }

        if (currentOverallStatus !== 'HIGH') {
            currentOverallStatus = 'HIGH';
            logActivity('CRITICAL ALERT', `Leak Detected – ${dangerZones.join(', ')}`, 'danger', 'fa-droplet');
            
            if (setAutoValve && setAutoValve.checked) {
                closeValveAutomatically();
            }

            if (!isMuted && alertModal) {
                alertText.textContent = `Water Level HIGH in ${dangerZones.join(', ')}!`;
                alertModal.classList.add('show');
            }
        }
    }
}

function closeValveAutomatically() {
    valveOpen = false;
    logActivity('Auto Shut-off', 'Main valve CLOSED', 'danger', 'fa-faucet-drip');
    const relayText = document.getElementById('relay-status-text');
    if(relayText) relayText.textContent = 'Status: OFF (Valve Closed)';
}

// --- ACTIVITY LOGS ---
function logActivity(title, desc, type, iconClass) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const log = { title, desc, type, iconClass, time };
    
    const logs = JSON.parse(localStorage.getItem('floodguard_logs') || '[]');
    logs.unshift(log);
    if (logs.length > 50) logs.pop();
    localStorage.setItem('floodguard_logs', JSON.stringify(logs));
    
    renderLogs(currentFilter);
    populateHistoryTable();
}

function loadLogs() {
    renderLogs('all');
}

let currentFilter = 'all';
function renderLogs(filter) {
    currentFilter = filter;
    if(!activityList) return;
    
    const logs = JSON.parse(localStorage.getItem('floodguard_logs') || '[]');
    const filtered = logs.filter(l => {
        if(filter === 'all') return true;
        if(filter === 'critical' && l.type === 'danger') return true;
        if(filter === 'normal' && (l.type === 'info' || l.type === 'warning')) return true;
        return false;
    });
    
    if(filtered.length === 0) {
        activityList.innerHTML = '<li style="justify-content:center; color: var(--text-gray);">No alerts matching filter.</li>';
        return;
    }

    activityList.innerHTML = filtered.map(log => `
        <li>
            <div class="log-icon ${log.type}"><i class="fa-solid ${log.iconClass}"></i></div>
            <div class="log-content">
                <h4>${log.title}</h4>
                <p>${log.desc}</p>
            </div>
            <span class="log-time">${log.time}</span>
        </li>
    `).join('');
}

function clearLogs() {
    if (confirm('Clear all logs?')) {
        localStorage.setItem('floodguard_logs', '[]');
        renderLogs(currentFilter);
    }
}

// --- BUTTON LISTENERS ---
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        renderLogs(e.target.dataset.filter);
    });
});

document.getElementById('btn-test-alert')?.addEventListener('click', () => {
    isMuted = false;
    logActivity('System Test', 'Manual alarm test triggered', 'info', 'fa-bell');
    showToast('Alarm test initiated manually', 'info', 'fa-bell-on');
    const sco = document.querySelector('.status-card-outer');
    if(sco) sco.style.background = 'var(--gradient-danger)';
    statusTitle.textContent = 'TESTING...';
    setTimeout(() => { if(systemActive) simulateData(); }, 2000);
});

document.getElementById('btn-system-toggle')?.addEventListener('click', (e) => {
    systemActive = !systemActive;
    
    const btn = document.getElementById('btn-system-toggle');
    if (systemActive) {
        btn.querySelector('span').innerHTML = 'System<br>ON';
        btn.querySelector('.action-icon').className = 'action-icon text-green';
        showToast('System is now ONLINE', 'success', 'fa-power-off');
        simulateData();
    } else {
        btn.querySelector('span').innerHTML = 'System<br>OFF';
        btn.querySelector('.action-icon').className = 'action-icon text-gray';
        showToast('System is now OFFLINE', 'info', 'fa-power-off');
        statusDesc.textContent = 'System is turned off';
        const sco = document.querySelector('.status-card-outer');
        if(sco) sco.style.background = '#64748b';
        if(alertPanelText) {
            alertPanelText.textContent = 'System Offline';
            alertPanelIcon.className = 'fa-solid fa-power-off text-gray';
        }
    }
});

document.getElementById('btn-auto-valve-toggle')?.addEventListener('click', () => {
    if(setAutoValve) setAutoValve.checked = !setAutoValve.checked;
    
    if(setAutoValve && setAutoValve.checked) {
        showToast('Auto Shut-off Activated', 'success', 'fa-shield');
    } else {
        showToast('Auto Shut-off Deactivated', 'error', 'fa-shield-virus');
    }
});

// Settings Toggles
document.getElementById('set-buzzer')?.addEventListener('change', (e) => {
    if(e.target.checked) showToast('Hardware buzzer enabled', 'success', 'fa-volume-high');
    else showToast('Hardware buzzer disabled', 'info', 'fa-volume-xmark');
});
document.getElementById('set-notifs')?.addEventListener('change', (e) => {
    if(e.target.checked) showToast('Push notifications enabled', 'success', 'fa-bell');
    else showToast('Push notifications muted', 'info', 'fa-bell-slash');
});

document.getElementById('btn-close-valve')?.addEventListener('click', () => {
    valveOpen = false;
    if(alertModal) alertModal.classList.remove('show');
    logActivity('Manual Shut-off', 'User closed main water valve', 'danger', 'fa-hand-dots');
});

document.getElementById('btn-mute')?.addEventListener('click', () => {
    isMuted = true;
    if(alertModal) alertModal.classList.remove('show');
});

// Settings Threshold UI
if(setThreshold) {
    setThreshold.addEventListener('input', (e) => {
        document.getElementById('threshold-val').textContent = e.target.value + '%';
    });
}

// --- CHART & DEVICE CONTROL ---
function initChart() {
    const ctx = document.getElementById('waterChart');
    if (!ctx) return;
    
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['1h ago', '45m ago', '30m ago', '15m ago', '5m ago', '1m ago', 'Now'],
            datasets: [{
                label: 'Avg Water Level (%)',
                data: [0, 0, 0, 0, 0, 0, 0],
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, max: 100 } }
        }
    });
}

function updateChart(newAvg) {
    if(!chartInstance) return;
    const data = chartInstance.data.datasets[0].data;
    data.shift();
    data.push(newAvg);
    chartInstance.update('none');
}

function populateHistoryTable() {
    const tbody = document.getElementById('history-table-body');
    if(!tbody) return;
    
    const logs = JSON.parse(localStorage.getItem('floodguard_logs') || '[]');
    
    tbody.innerHTML = logs.slice(0, 10).map(log => {
        let badgeClass = 'badge-safe';
        if(log.type === 'danger') badgeClass = 'badge-danger';
        if(log.type === 'warning') badgeClass = 'badge-normal';
        
        return `
            <tr>
                <td style="font-weight:600;">${log.time}</td>
                <td>System</td>
                <td><span class="status-badge ${badgeClass}">${log.title}</span></td>
                <td style="color:var(--text-gray);">${log.desc}</td>
            </tr>
        `;
    }).join('');
}

function updateDeviceControls(primaryVal) {
    const liveVal = document.getElementById('live-reading-val');
    const liveFill = document.getElementById('live-reading-fill');
    if(liveVal) liveVal.innerHTML = `${Math.floor(primaryVal)}<span style="font-size:24px;">%</span>`;
    if(liveFill) liveFill.style.height = `${primaryVal}%`;

    const valveToggle = document.getElementById('device-valve-toggle');
    if(valveToggle) valveToggle.checked = valveOpen;
}

document.getElementById('device-valve-toggle')?.addEventListener('change', (e) => {
    valveOpen = e.target.checked;
    showToast(`Valve ${valveOpen ? 'Opened' : 'Closed'} manually`, valveOpen ? 'success' : 'error', 'fa-faucet');
    logActivity('Valve Control', `User ${valveOpen ? 'opened' : 'closed'} the valve`, valveOpen ? 'info' : 'danger', 'fa-faucet');
});

document.getElementById('device-manual-toggle')?.addEventListener('change', (e) => {
    const isOverride = e.target.checked;
    showToast(`Manual Override ${isOverride ? 'Enabled' : 'Disabled'}`, 'info', 'fa-hand-dots');
});

document.getElementById('btn-manual-relay')?.addEventListener('click', (e) => {
    valveOpen = !valveOpen;
    e.target.textContent = valveOpen ? 'Turn OFF' : 'Turn ON';
    document.getElementById('relay-status-text').textContent = valveOpen ? 'Status: ON (Valve Open)' : 'Status: OFF (Valve Closed)';
});
// --- SETTINGS & WIFI LOGIC ---
function initSettings() {
    // Persistence for settings
    const savedSettings = JSON.parse(localStorage.getItem('floodguard_settings') || '{}');
    
    if (savedSettings.autoValve !== undefined && setAutoValve) setAutoValve.checked = savedSettings.autoValve;
    if (savedSettings.buzzer !== undefined && setBuzzer) setBuzzer.checked = savedSettings.buzzer;
    if (savedSettings.led !== undefined && setLed) setLed.checked = savedSettings.led;
    if (savedSettings.notifs !== undefined && setNotifs) setNotifs.checked = savedSettings.notifs;

    // Listeners
    const toggles = [
        { el: setAutoValve, key: 'autoValve', name: 'Auto Shut-off' },
        { el: setBuzzer, key: 'buzzer', name: 'Buzzer' },
        { el: setLed, key: 'led', name: 'LED Indicator' },
        { el: setNotifs, key: 'notifs', name: 'Notifications' }
    ];

    toggles.forEach(t => {
        t.el?.addEventListener('change', () => {
            const settings = JSON.parse(localStorage.getItem('floodguard_settings') || '{}');
            settings[t.key] = t.el.checked;
            localStorage.setItem('floodguard_settings', JSON.stringify(settings));
            
            showToast(`${t.name} is now ${t.el.checked ? 'ON' : 'OFF'}`, 'info', 'fa-sliders');
        });
    });

    // Threshold toggle
    const setThresholdVal = document.getElementById('set-threshold-val');
    const thresholds = ["Low (30%)", "Medium (60%)", "High (90%)"];
    let currentThresholdIdx = 1;

    setThresholdVal?.closest('.setting-list-item').addEventListener('click', () => {
        currentThresholdIdx = (currentThresholdIdx + 1) % thresholds.length;
        setThresholdVal.textContent = thresholds[currentThresholdIdx];
        showToast(`Sensitivity set to ${thresholds[currentThresholdIdx]}`, 'info', 'fa-stopwatch');
        
        const settings = JSON.parse(localStorage.getItem('floodguard_settings') || '{}');
        settings.threshold = thresholds[currentThresholdIdx];
        localStorage.setItem('floodguard_settings', JSON.stringify(settings));
    });

    // Load saved threshold
    if (savedSettings.threshold) {
        setThresholdVal.textContent = savedSettings.threshold;
        currentThresholdIdx = thresholds.indexOf(savedSettings.threshold);
    }

    // WiFi Selector Logic
    const wifiSettingRow = wifiNameDisplay?.closest('.setting-list-item');
    const wifiModal = document.getElementById('wifi-modal');
    const closeWifiModal = document.getElementById('close-wifi-modal');
    const wifiListEl = document.getElementById('wifi-list');

    const networks = [
        { name: "FloodGuard_AP_7A22", secure: false, level: 4 }
    ];

    wifiSettingRow?.addEventListener('click', () => {
        wifiModal.classList.add('show');
        if (wifiListEl) {
            wifiListEl.innerHTML = `
                <div style="padding: 40px 24px; text-align: center; color: var(--text-gray);">
                    <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 28px; margin-bottom: 16px; color: var(--primary-blue);"></i>
                    <p style="font-size: 14px; font-weight: 600;">Scanning for available networks...</p>
                    <p style="font-size: 11px; opacity: 0.7; margin-top: 4px;">Searching for ESP8266 and local APs</p>
                </div>
            `;
            setTimeout(renderWiFiList, 2000); // 2s realistic scan
        }
    });

    closeWifiModal?.addEventListener('click', () => {
        wifiModal.classList.remove('show');
    });

    function renderWiFiList() {
        if (!wifiListEl) return;
        const currentWiFi = wifiNameDisplay.textContent;
        
        // Randomize levels slightly for real-time feel
        const dynamicNetworks = networks.map(n => ({
            ...n,
            level: n.name === currentWiFi ? 4 : Math.floor(Math.random() * 3) + 1
        })).sort((a, b) => b.level - a.level);

        wifiListEl.innerHTML = dynamicNetworks.map(net => `
            <div class="wifi-item ${net.name === currentWiFi ? 'connected' : ''}" onclick="connectWiFi('${net.name}')">
                <div class="wifi-left">
                    <i class="fa-solid fa-wifi" style="opacity: ${0.3 + (net.level * 0.17)};"></i>
                    <div class="wifi-info">
                        <span class="wifi-name">${net.name}</span>
                        <span class="wifi-status">${net.name === currentWiFi ? 'Connected' : (net.secure ? 'Secure' : 'Open')}</span>
                    </div>
                </div>
                <div class="wifi-right">
                    ${net.name === currentWiFi ? '<i class="fa-solid fa-check" style="color: var(--primary-blue);"></i>' : (net.secure ? '<i class="fa-solid fa-lock"></i>' : '')}
                </div>
            </div>
        `).join('');
    }

    window.connectWiFi = (name) => {
        const currentWiFi = wifiNameDisplay.textContent;
        if (name === currentWiFi) {
            wifiModal.classList.remove('show');
            return;
        }

        showToast(`Connecting to ${name}...`, 'info', 'fa-spinner fa-spin');
        
        // Simulate connection delay
        setTimeout(() => {
            wifiNameDisplay.textContent = name;
            wifiNameDisplay.style.color = "#10b981";
            wifiModal.classList.remove('show');
            showToast(`Connected to ${name}`, 'success', 'fa-wifi');
            
            const settings = JSON.parse(localStorage.getItem('floodguard_settings') || '{}');
            settings.wifi = name;
            localStorage.setItem('floodguard_settings', JSON.stringify(settings));
        }, 1500);
    };

    window.addCustomWiFi = () => {
        const name = prompt("Enter WiFi Network Name (SSID):");
        if (name && name.trim()) {
            networks.push({ name: name.trim(), secure: true, level: 4 });
            showToast(`Searching for ${name}...`, 'info', 'fa-magnifying-glass');
            setTimeout(() => {
                renderWiFiList();
                showToast(`Found ${name} in range`, 'success', 'fa-wifi');
            }, 1000);
        }
    };

    // Load saved WiFi
    if (savedSettings.wifi) {
        wifiNameDisplay.textContent = savedSettings.wifi;
    }
}

// --- ACCOUNT FUNCTIONS ---
function showProfile() {
    if (activeUser) {
        document.getElementById('prof-name').textContent = activeUser.name;
        document.getElementById('prof-email').textContent = activeUser.email;
    }
    document.getElementById('profile-modal').classList.add('show');
}

function showChangePass() {
    showToast('Redirecting to secure password reset...', 'info', 'fa-lock');
    // Mock functionality: just show a message for now
    setTimeout(() => {
        showToast('Password reset link sent to your email', 'success', 'fa-envelope');
    }, 1500);
}

function showAbout() {
    document.getElementById('about-modal').classList.add('show');
}

function logout() {
    localStorage.removeItem('floodguard_session');
    sessionStorage.removeItem('floodguard_session');
    activeUser = null;
    showToast('Logged out successfully', 'info', 'fa-right-from-bracket');
    setTimeout(() => {
        switchView('view-login');
        if(simulationInterval) clearInterval(simulationInterval);
    }, 800);
}

// Make these globally accessible
window.showProfile = showProfile;
window.showChangePass = showChangePass;
window.showAbout = showAbout;
window.logout = logout;

function updateWiFiStatus() {
    if (!wifiNameDisplay) return;
    
    const savedSettings = JSON.parse(localStorage.getItem('floodguard_settings') || '{}');
    
    if (savedSettings.wifi) {
        wifiNameDisplay.textContent = savedSettings.wifi;
        wifiNameDisplay.style.color = "#10b981";
    } else {
        wifiNameDisplay.textContent = "Not Connected";
        wifiNameDisplay.style.color = "#94a3b8";
    }

    // Listen for network changes (Internet)
    window.addEventListener('online', () => {
        showToast('Cloud database reachable', 'success', 'fa-cloud');
    });

    window.addEventListener('offline', () => {
        showToast('Internet connection lost', 'error', 'fa-wifi');
    });
}

// --- HARDWARE CONNECTIVITY (Firebase) ---
const FIREBASE_URL = "https://flood-prevention-system-default-rtdb.asia-southeast1.firebasedatabase.app/sensor.json";
let firebaseInterval = null;
let reconnectTimer = null;

// --- VIBRATION HELPER ---
function triggerVibration(pattern) {
    if ("vibrate" in navigator) {
        try { navigator.vibrate(pattern); } catch(e) {}
    }
}

function connectToHardware() {
    if (firebaseInterval) clearInterval(firebaseInterval);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    
    showToast(`Connecting to Cloud Server...`, 'info', 'fa-cloud');
    triggerVibration(50);
    
    // Initial fetch
    fetch(FIREBASE_URL, { cache: "no-store" })
        .then(res => res.json())
        .then(data => {
            if (data) {
                hardwareConnected = true;
                triggerVibration([50, 100, 50]); // Happy double-buzz
                showToast('Hardware Successfully Linked!', 'success', 'fa-cloud-check');
                logActivity('Firebase Link', `Connected to cloud database`, 'info', 'fa-cloud');
                
                // Start polling every 3 seconds to match hardware
                firebaseInterval = setInterval(syncWithFirebase, 3000);
                
                // Update UI indicator to active state
                updateHardwareIndicator('online');
                
                syncWithFirebase(); // Process first data point
            } else {
                throw new Error("No data received");
            }
        })
        .catch(err => {
            console.error("Firebase Connection Error:", err);
            updateHardwareIndicator('offline');
            triggerVibration([100, 50, 100]); // Error buzz
            showToast('Connection failed. Retrying in 5s...', 'error', 'fa-wifi');
            
            // AUTO-RECONNECT ENGINE
            reconnectTimer = setTimeout(connectToHardware, 5000);
        });
}

function updateHardwareIndicator(status) {
    const dotTop = document.getElementById('status-dot-top');
    const textTop = document.getElementById('status-text-top');
    const dotChip = document.getElementById('status-dot-chip');
    const textChip = document.getElementById('status-text-chip');
    
    if(status === 'online') {
        if(dotTop) dotTop.className = "dot green";
        if(textTop) textTop.textContent = "ESP8266 Online";
        if(dotChip) dotChip.className = "dot green";
        if(textChip) textChip.textContent = "Online";
    } else {
        if(dotTop) dotTop.className = "dot red";
        if(textTop) textTop.textContent = "Hardware Offline";
        if(dotChip) dotChip.className = "dot red";
        if(textChip) textChip.textContent = "Offline";
    }
}

function syncWithFirebase() {
    if (!hardwareConnected) return;

    fetch(FIREBASE_URL, { cache: "no-store" })
        .then(res => res.json())
        .then(data => {
            if (!data) return;

            // STALE DATA PROTECTION (Timestamp Check)
            // If ESP8266 sends a 'timestamp', ensure it's not older than 15 seconds
            const nowSeconds = Math.floor(Date.now() / 1000);
            const hardwareTime = data.timestamp || 0;
            const isStale = (hardwareTime > 0) && ((nowSeconds - hardwareTime) > 15);
            
            if (isStale) {
                console.warn("Stale Data Detected. Hardware offline.");
                updateHardwareIndicator('offline');
                document.getElementById('status-title').textContent = "OFFLINE";
                document.getElementById('status-desc').textContent = "Hardware disconnected or lost power";
                return; // Abort processing old data
            }

            if (typeof data.water !== 'undefined') {
                // DATA VALIDATION & ACCURACY MAPPING
                // The water sensor (A0) usually reads 0-800 in actual flood conditions
                const rawWater = parseInt(data.water) || 0;
                const waterPercent = Math.min(100, Math.max(0, Math.floor((rawWater / 800) * 100)));
                
                // Update specific zone with validated data
                zones.kitchen.val = waterPercent;
                if (zones.kitchen.el) {
                    const status = data.status || (waterPercent > 15 ? "WARNING" : "SAFE");
                    zones.kitchen.el.textContent = status;
                    zones.kitchen.el.className = `s-val status-${status.toLowerCase()}`;
                }
                
                // Update Live Gauge
                const liveVal = document.getElementById('live-reading-val');
                const liveFill = document.getElementById('live-reading-fill');
                if(liveVal) liveVal.innerHTML = `${waterPercent}<span style="font-size:24px;">%</span>`;
                if(liveFill) liveFill.style.height = `${waterPercent}%`;
                
                // Update Timestamp for "Accuracy" feedback
                const timeEl = document.getElementById('status-time');
                if(timeEl) {
                    const now = new Date();
                    timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                }

                // Severity Logic
                let severity = 0;
                if (data.status === "FLOOD" || waterPercent > 70) severity = 2;
                else if (data.status === "WARNING" || waterPercent > 30) severity = 1;
                
                updateOverallStatus(severity, severity > 0 ? [data.alert || "Water Detected"] : []);
                updateChart(waterPercent);
                updateHardwareIndicator('online');
            } else {
                console.warn("Incomplete data received from hardware");
            }
        })
        .catch(err => {
            console.error("Polling Error:", err);
            updateHardwareIndicator('offline');
        });
}

// Add vibration to Action buttons
document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => triggerVibration(30));
});

window.connectToHardware = connectToHardware;
