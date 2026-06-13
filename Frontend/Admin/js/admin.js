const API = import.meta.env.VITE_API_URL || '';
const SESSION_DURATION = 30 * 60 * 1000; // 30 Minutes

// ── Session Guard ────────────────────────────────────────────
function isSessionValid() {
    const loginTime = sessionStorage.getItem('login_time');
    const key = sessionStorage.getItem('admin_api_key');
    if (!loginTime || !key) return false;
    return (Date.now() - parseInt(loginTime)) < SESSION_DURATION;
}

// If no valid session, immediately redirect to login and stop execution
if (!isSessionValid()) {
    window.location.href = './login.html';
    throw new Error("Unauthorized"); 
}

function logout() {
    sessionStorage.removeItem('admin_api_key');
    sessionStorage.removeItem('login_time');
    window.location.href = './login.html';
}

async function adminFetch(url, options = {}) {
    if (!isSessionValid()) {
        window.location.href = './login.html';
        throw new Error('Session expired.');
    }
    const headers = options.headers || {};
    headers['x-api-key'] = sessionStorage.getItem('admin_api_key');
    options.headers = headers;
    
    const res = await fetch(url, options);
    
    if (res.status === 403 || res.status === 401) {
        sessionStorage.removeItem('admin_api_key');
        sessionStorage.removeItem('login_time');
        window.location.href = './login.html';
        throw new Error('Invalid API Key');
    }
    return res;
}

// ── Toast notification ────────────────────────────────────────
function showToast(msg, type = 'ok') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `toast toast-${type} show`;
    setTimeout(() => { el.className = 'toast'; }, 3800);
}

// ── Animated number counter ───────────────────────────────────
function animateCount(el, target, suffix = '', decimals = 0) {
    const start = 0, dur = 900;
    const t0 = performance.now();
    function step(now) {
        const p = Math.min((now - t0) / dur, 1);
        const ease = 1 - Math.pow(1 - p, 3);
        el.textContent = (start + (target - start) * ease).toFixed(decimals) + suffix;
        if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// ... [KEEP ALL YOUR renderZone1, renderSparkline, renderZone2, renderZone3, renderDisputes, approveDispute, rejectDispute, syncCache, setCacheStatus, loadDashboard FUNCTIONS EXACTLY AS THEY WERE] ...

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', loadDashboard);
setInterval(loadDashboard, 60_000);

// Expose to window for inline HTML onclick handlers
window.syncCache = syncCache;
window.loadDashboard = loadDashboard;
window.approveDispute = approveDispute;
window.rejectDispute = rejectDispute;
window.logout = logout;