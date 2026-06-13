const API = import.meta.env.VITE_API_URL || '';

const btn = document.getElementById('login-btn');
const input = document.getElementById('admin-api-key-input');
const errorEl = document.getElementById('login-error');

async function attemptLogin() {
    const key = input.value.trim();
    if (!key) {
        errorEl.textContent = "Please enter a key.";
        errorEl.style.display = 'block';
        return;
    }

    btn.disabled = true;
    btn.textContent = "Verifying...";
    errorEl.style.display = 'none';

    try {
        // Test the key securely against the backend
        const res = await fetch(`${API}/api/admin/stats`, {
            headers: { 'x-api-key': key }
        });

        if (res.ok) {
            // Key is valid! Save to session and redirect
            sessionStorage.setItem('admin_api_key', key);
            sessionStorage.setItem('login_time', Date.now());
            window.location.href = './dashboard.html';
        } else {
            throw new Error('Unauthorized');
        }
    } catch (err) {
        errorEl.textContent = "Invalid API Key or Server Unreachable.";
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = "Unlock Dashboard";
    }
}

btn.addEventListener('click', attemptLogin);
input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') attemptLogin();
});