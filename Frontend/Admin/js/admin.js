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
    headers['X-API-KEY'] = sessionStorage.getItem('admin_api_key');
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


// ── Zone 1: Stat Cards ────────────────────────────────────────
function renderZone1(z1, trend7d) {
  const prev = z1.prev_total_24h || 0;
  const delta = z1.total_scans_24h - prev;
  const deltaSign = delta >= 0 ? '+' : '';
  const deltaClass = delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral';
  const msColor = z1.avg_response_ms < 300 ? 'var(--emerald)' : z1.avg_response_ms < 600 ? 'var(--amber)' : 'var(--rose)';
  const threatPct = (z1.threat_ratio * 100).toFixed(1);
  const threatColor = z1.threat_ratio < 0.3 ? 'var(--emerald)' : z1.threat_ratio < 0.5 ? 'var(--amber)' : 'var(--rose)';

  const cards = [
    { label: 'Scans (24h)', value: z1.total_scans_24h, accent: 'var(--indigo)',
      sub: `<span class="stat-delta ${deltaClass}">${deltaSign}${delta} vs prev 24h</span>` },
    { label: 'Avg Response Time', value: z1.avg_response_ms, suffix: 'ms', accent: msColor,
      sub: z1.avg_response_ms < 300 ? '✅ Target met (<300ms)' : z1.avg_response_ms < 600 ? '⚠️ Acceptable' : '🚨 Too slow — check ML load' },
    { label: 'Threat Ratio', value: parseFloat(threatPct), suffix: '%', accent: threatColor, decimals: 1,
      sub: `${z1.phishing_count} phishing · ${z1.legitimate_count} legitimate` },
    { label: 'Open Disputes', value: window._disputeCount || 0, accent: 'var(--rose)',
      sub: 'False positive reports pending' },
  ];

  const container = document.getElementById('zone1-cards');
  container.innerHTML = cards.map(c => `
    <div class="stat-card" style="--accent:${c.accent}">
      <p class="stat-label">${c.label}</p>
      <p class="stat-value" data-target="${c.value}" data-suffix="${c.suffix || ''}" data-dec="${c.decimals || 0}">0</p>
      <p class="stat-sub">${c.sub}</p>
    </div>
  `).join('');

  container.querySelectorAll('.stat-value').forEach(el => {
    animateCount(el, parseFloat(el.dataset.target), el.dataset.suffix, parseInt(el.dataset.dec));
  });

  renderSparkline(trend7d);
}

// ── 7-day Sparkline ───────────────────────────────────────────
function renderSparkline(trend) {
  const svg = document.getElementById('sparkline-svg');
  const labels = document.getElementById('sparkline-labels');
  if (!trend || !trend.length) {
    svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#475569" font-size="12" font-family="JetBrains Mono">No trend data yet</text>';
    return;
  }
  const W = 700, H = 72, PAD = 6;
  const totals = trend.map(d => +d.total);
  const phishings = trend.map(d => +d.phishing);
  const maxV = Math.max(...totals, 1);
  const x = (i) => PAD + (i / Math.max(trend.length - 1, 1)) * (W - PAD * 2);
  const y = (v) => H - PAD - (v / maxV) * (H - PAD * 2);

  const pathTotal   = trend.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(+d.total)}`).join(' ');
  const pathPhish   = trend.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(+d.phishing)}`).join(' ');
  const areaClose   = ` L ${x(trend.length-1)} ${H} L ${x(0)} ${H} Z`;

  svg.innerHTML = `
    <defs>
      <linearGradient id="grad-total" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#818cf8" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#818cf8" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="grad-phish" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.2"/>
        <stop offset="100%" stop-color="#f43f5e" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${pathTotal} ${areaClose}" fill="url(#grad-total)"/>
    <path d="${pathPhish} ${areaClose}" fill="url(#grad-phish)"/>
    <path d="${pathTotal}" fill="none" stroke="#818cf8" stroke-width="2" stroke-linecap="round"/>
    <path d="${pathPhish}" fill="none" stroke="#f43f5e" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="4 2"/>
    ${trend.map((d, i) => `<circle cx="${x(i)}" cy="${y(+d.total)}" r="3" fill="#818cf8"/>`).join('')}
  `;

  labels.innerHTML = trend.map(d => `<span>${d.scan_date ? d.scan_date.slice(5) : ''}</span>`).join('');
}

// ── Zone 2: Pipeline Efficiency ───────────────────────────────
function renderZone2(z2) {
  const rate = z2.ml_bypass_rate || 0;

  // Animate gauge arc (semicircle, dasharray=251)
  const arc = document.getElementById('gauge-arc');
  const offset = 251 - (rate / 100) * 251;
  arc.style.strokeDashoffset = 251; // reset for animation
  arc.style.stroke = rate >= 60 ? 'var(--emerald)' : rate >= 40 ? 'var(--amber)' : 'var(--rose)';
  setTimeout(() => { arc.style.strokeDashoffset = offset; }, 80);

  const numEl = document.getElementById('bypass-rate-num');
  numEl.style.color = rate >= 60 ? 'var(--emerald)' : rate >= 40 ? 'var(--amber)' : 'var(--rose)';
  animateCount(numEl, rate, '%', 1);

  const hint = document.getElementById('bypass-hint');
  if (rate >= 60)      hint.textContent = '✅ Optimized — CPU is well-protected';
  else if (rate >= 40) hint.textContent = '⚠️ Moderate — monitor ML load';
  else                 hint.textContent = '🚨 Low — ML running too often';

  // Breakdown bars
  const total = z2.total_scans_24h || 1;
  const bd = z2.skip_breakdown || {};
  const bars = [
    { label: 'Whitelist', count: bd.whitelist || 0, color: 'var(--emerald)' },
    { label: 'Blacklist', count: bd.blacklist || 0, color: 'var(--rose)' },
    { label: 'Heuristic / GSB', count: bd.heuristic_block || 0, color: 'var(--amber)' },
    { label: 'ML Ran (full pipeline)', count: bd.ml_ran || 0, color: 'var(--indigo)' },
  ];
  document.getElementById('skip-breakdown-bars').innerHTML = bars.map(b => {
    const pct = total > 0 ? Math.round(b.count / total * 100) : 0;
    return `
      <div class="bar-row">
        <div class="bar-row-header">
          <span>${b.label}</span>
          <span>${b.count} <span style="color:var(--text-muted)">(${pct}%)</span></span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:0%;background:${b.color}" data-pct="${pct}"></div>
        </div>
      </div>`;
  }).join('');
  setTimeout(() => {
    document.querySelectorAll('#skip-breakdown-bars .bar-fill').forEach(el => {
      el.style.width = el.dataset.pct + '%';
    });
  }, 100);

  // Smart insight
  const insightEl = document.getElementById('pipeline-insight');
  if (rate < 40 && total > 0) {
    insightEl.style.display = 'block';
    insightEl.className = 'insight-card insight-crit';
    insightEl.textContent = `⚠️ Smart Insight: ML Bypass Rate is critically low (${rate}%). The Random Forest model is running for ${z2.ml_ran_count} of ${total} scans. Check Google Safe Browsing API key and verify heuristic.py rules are active.`;
  } else if (rate >= 60) {
    insightEl.style.display = 'block';
    insightEl.className = 'insight-card insight-good';
    insightEl.textContent = `✅ System Optimized: ${rate}% of scans bypass ML. The Decision Gate is protecting your 1-vCPU server effectively.`;
  } else {
    insightEl.style.display = 'none';
  }
}

// ── Zone 3: Educational Telemetry ─────────────────────────────
function renderZone3(z3) {
  const domains = z3.domains || [];
  const failed  = z3.top_failed_questions || [];

  // Domain accuracy bars
  const accContainer = document.getElementById('domain-accuracy-bars');
  if (!domains.length) {
    accContainer.innerHTML = '<p style="color:var(--text-muted);font-size:12px">No quiz data yet. Questions need to be served first.</p>';
  } else {
    accContainer.innerHTML = domains.map(d => {
      const total = +d.total_attempts || 0;
      const correct = +d.correct || 0;
      const pct = total > 0 ? Math.round(correct / total * 100) : 0;
      const color = pct >= 70 ? 'var(--emerald)' : pct >= 50 ? 'var(--amber)' : 'var(--rose)';
      const label = pct >= 70 ? '✅' : pct >= 50 ? '⚠️' : '🚨';
      return `
        <div class="acc-row">
          <div class="acc-row-header">
            <span class="acc-domain">${label} ${d.domain}</span>
            <span class="acc-pct" style="color:${color}">${pct}%</span>
          </div>
          <div class="acc-track">
            <div class="acc-fill" style="width:0%;background:${color}" data-pct="${pct}"></div>
          </div>
          <span class="acc-attempts">${correct} correct / ${total} attempts · ${+d.total_fetched || 0} served</span>
        </div>`;
    }).join('');
    setTimeout(() => {
      document.querySelectorAll('.acc-fill').forEach(el => { el.style.width = el.dataset.pct + '%'; });
    }, 100);
  }

  // Top failed questions
  const failedEl = document.getElementById('top-failed-list');
  if (!failed.length) {
    failedEl.innerHTML = '<li style="color:var(--text-muted);font-size:11px;padding:8px 0">No answered questions yet.</li>';
  } else {
    failedEl.innerHTML = failed.map((q, i) => {
      const total = (q.times_correct || 0) + (q.times_incorrect || 0);
      const failRate = total > 0 ? Math.round(q.times_incorrect / total * 100) : 0;
      return `
        <li class="failed-item">
          <span class="failed-q">${i + 1}. ${q.question_text}</span>
          <span class="failed-meta">Fail rate: ${failRate}% · ${q.times_incorrect} wrong / ${total} attempts</span>
        </li>`;
    }).join('');
  }

  // Smart insight for education
  const eduInsight = document.getElementById('edu-insight');
  const weakDomain = domains
    .filter(d => +d.total_attempts > 0)
    .sort((a, b) => {
      const pa = +a.correct / Math.max(+a.total_attempts, 1);
      const pb = +b.correct / Math.max(+b.total_attempts, 1);
      return pa - pb;
    })[0];

  if (weakDomain) {
    const pct = Math.round(+weakDomain.correct / Math.max(+weakDomain.total_attempts, 1) * 100);
    if (pct < 50) {
      eduInsight.style.display = 'block';
      eduInsight.className = 'insight-card insight-warn';
      eduInsight.textContent = `📚 Knowledge Gap Detected: Users are scoring only ${pct}% on "${weakDomain.domain}" questions. Consider adding more questions for this category or increasing its frequency in the Pre-Scan Hook.`;
    }
  }
}

// ── Zone 4: Dispute Queue ─────────────────────────────────────
function renderDisputes(disputes) {
  const badge = document.getElementById('dispute-count-badge');
  badge.textContent = disputes.length;
  window._disputeCount = disputes.length;

  const tbody = document.getElementById('disputes-tbody');
  const empty = document.getElementById('disputes-empty');
  const wrap  = document.getElementById('disputes-table-wrap');

  if (!disputes.length) {
    empty.style.display = 'block';
    wrap.style.display  = 'none';
    return;
  }
  empty.style.display = 'none';
  wrap.style.display  = 'block';

  tbody.innerHTML = disputes.map(fp => {
    const date = fp.created_at ? new Date(fp.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '—';
    const score = fp.similarity_score != null ? (fp.similarity_score * 100).toFixed(0) + '%' : '—';
    const rule  = fp.triggered_rule ? `<span class="rule-badge">${fp.triggered_rule}</span>` : '<span style="color:var(--text-muted)">—</span>';
    const brand = fp.matched_brand  ? `<span style="color:var(--amber)">${fp.matched_brand}</span>` : '—';
    const note  = fp.notes ? `<span class="note-text" title="${fp.notes}">${fp.notes.slice(0, 60)}${fp.notes.length > 60 ? '…' : ''}</span>` : '<span style="color:var(--text-muted)">—</span>';
    return `
      <tr data-id="${fp.id}">
        <td>#${fp.id}</td>
        <td style="white-space:nowrap;color:var(--text-muted)">${date}</td>
        <td><span class="domain-text">${fp.domain || '—'}</span></td>
        <td>${rule}</td>
        <td>${brand}</td>
        <td style="color:var(--text-muted)">${score}</td>
        <td>${note}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-emerald" onclick="approveDispute(${fp.id},this)">✅ Approve</button>
            <button class="btn btn-rose"    onclick="rejectDispute(${fp.id},false,this)">❌ Reject</button>
            <button class="btn btn-slate"   onclick="rejectDispute(${fp.id},true,this)" title="Reject and add to blacklist">🔒 Blacklist</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

// ── Actions ───────────────────────────────────────────────────
async function approveDispute(id, btn) {
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const r = await adminFetch(`${API}/api/feedback/${id}/approve`, { method: 'POST' });
    if (!r.ok) throw new Error(await r.text());
    const d = await r.json();
    showToast(`✅ Approved — ${d.domain} whitelisted & cache reloaded`, 'ok');
    document.querySelector(`tr[data-id="${id}"]`)?.remove();
    const remaining = document.querySelectorAll('#disputes-tbody tr[data-id]').length;
    document.getElementById('dispute-count-badge').textContent = remaining;
    if (!remaining) {
      document.getElementById('disputes-empty').style.display = 'block';
      document.getElementById('disputes-table-wrap').style.display = 'none';
    }
  } catch (e) {
    showToast(`❌ Error: ${e.message}`, 'err');
    btn.disabled = false;
    btn.textContent = '✅ Approve';
  }
}

async function rejectDispute(id, blacklist, btn) {
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const r = await adminFetch(`${API}/api/feedback/${id}/reject?blacklist=${blacklist}`, { method: 'POST' });
    if (!r.ok) throw new Error(await r.text());
    const d = await r.json();
    const msg = blacklist ? `🔒 Rejected & blacklisted` : `❌ Rejected — dispute dismissed`;
    showToast(msg, blacklist ? 'err' : 'ok');
    document.querySelector(`tr[data-id="${id}"]`)?.remove();
    const remaining = document.querySelectorAll('#disputes-tbody tr[data-id]').length;
    document.getElementById('dispute-count-badge').textContent = remaining;
  } catch (e) {
    showToast(`❌ Error: ${e.message}`, 'err');
    btn.disabled = false;
    btn.textContent = blacklist ? '🔒 Blacklist' : '❌ Reject';
  }
}

async function syncCache() {
  try {
    const r = await adminFetch(`${API}/api/cache/reload`, { method: 'POST' });
    if (!r.ok) throw new Error(await r.text());
    const d = await r.json();
    showToast(`⟳ Cache synced — ${d.whitelist} whitelist · ${d.blacklist} blacklist entries`, 'ok');
    setCacheStatus(true);
  } catch (e) {
    showToast(`❌ Cache sync failed: ${e.message}`, 'err');
  }
}

function setCacheStatus(ok) {
  const el = document.getElementById('cache-status');
  el.className = `cache-status ${ok ? 'cache-ok' : 'cache-warn'}`;
  el.querySelector('.cache-label').textContent = ok ? 'Cache In-Sync' : 'Cache Out-of-Sync';
}

// ── Main Load ─────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const [statsRes, feedRes] = await Promise.all([
      adminFetch(`${API}/api/admin/stats`),
      adminFetch(`${API}/api/feedback?resolved=false&limit=50`),
    ]);

    if (!statsRes.ok) throw new Error(`Stats API ${statsRes.status}`);
    const stats = await statsRes.json();
    const disputes = feedRes.ok ? await feedRes.json() : [];

    window._disputeCount = disputes.length;

    renderZone1(stats.zone1, stats.trend_7d || []);
    renderZone2(stats.zone2);
    renderZone3(stats.zone3);
    renderDisputes(disputes);

    document.getElementById('last-updated-time').textContent = new Date().toLocaleTimeString();

  } catch (e) {
    showToast(`❌ Failed to load dashboard: ${e.message}`, 'err');
    console.error(e);
  }
}

// ── Zone 5: Database CRUD ───────────────────────────────────
document.querySelectorAll('.db-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.db-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.db-tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
        loadCrudData(btn.dataset.tab);
    });
});

async function loadCrudData(tab) {
    try {
        if (tab === 'whitelist') {
            const r = await adminFetch(`${API}/api/whitelist?limit=100`);
            const data = await r.json();
            document.getElementById('tbody-whitelist').innerHTML = data.map(d => `
                <tr>
                    <td class="domain-text">${d.domain}</td>
                    <td>${d.added_by || 'system'}</td>
                    <td><button class="btn btn-rose" onclick="deleteItem(this)" data-type="whitelist" data-id="${d.domain}">Delete</button></td>
                </tr>
            `).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">Empty</td></tr>';
        } 
        else if (tab === 'blacklist') {
            const r = await adminFetch(`${API}/api/blacklist?limit=100`);
            const data = await r.json();
            document.getElementById('tbody-blacklist').innerHTML = data.map(d => `
                <tr>
                    <td class="domain-text">${d.domain}</td>
                    <td>${d.confidence}</td>
                    <td>${d.source || 'manual'}</td>
                    <td><button class="btn btn-rose" onclick="deleteItem(this)" data-type="blacklist" data-id="${d.domain}">Delete</button></td>
                </tr>
            `).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">Empty</td></tr>';
        } 
        else if (tab === 'brands') {
            const r = await adminFetch(`${API}/api/brands`);
            const data = await r.json();
            document.getElementById('tbody-brands').innerHTML = data.map(b => `
                <tr>
                    <td><strong>${b.name}</strong> <span style="color:var(--text-muted)">(${b.display_name || ''})</span></td>
                    <td>${b.domains ? b.domains.join(', ') : (b.domain || '-')}</td>
                    <td><button class="btn btn-rose" onclick="deleteBrand(this)" data-name="${b.name}">Delete</button></td>
                </tr>
            `).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">Empty</td></tr>';
        } 
        else if (tab === 'quiz') {
            // Load threat domains for dropdown
            const statsR = await adminFetch(`${API}/api/admin/stats`);
            const stats = await statsR.json();
            const threatDomains = stats.zone3.domains.map(d => d.domain);
            document.getElementById('quiz-domain-select').innerHTML = threatDomains.map(d => `<option value="${d}">${d}</option>`).join('');

            const r = await adminFetch(`${API}/api/quiz/questions?limit=50`);
            const data = await r.json();
            document.getElementById('tbody-quiz').innerHTML = data.map(q => `
                <tr>
                    <td>#${q.id}</td>
                    <td><span class="rule-badge">${q.domain}</span></td>
                    <td style="max-width:400px;">${q.question_text}</td>
                    <td><button class="btn btn-rose" onclick="deleteItem('quiz', ${q.id})">Delete</button></td>
                </tr>
            `).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">Empty</td></tr>';
        }
    } catch (e) {
        console.error("CRUD Load Error:", e);
    }
}

async function deleteItem(type, idOrDomain) {
    const type = btn.dataset.type;
    const idOrDomain = btn.dataset.id;
    if(!confirm(`Are you sure you want to delete ${idOrDomain}?`)) return
    let url = '';
    if (type === 'whitelist') url = `${API}/api/whitelist/${idOrDomain}`;
    if (type === 'blacklist') url = `${API}/api/blacklist/${idOrDomain}`;
    if (type === 'quiz') url = `${API}/api/quiz/questions/${idOrDomain}`;
    
    const r = await adminFetch(url, { method: 'DELETE' });
    if (r.ok) {
        showToast(`Deleted ${idOrDomain}`, 'ok');
        loadCrudData(type);
        syncCache(); 
    } else {
        showToast('Delete failed', 'err');
    }
}

async function deleteBrand(name) {
    const name = btn.dataset.name;
    if(!confirm(`Delete brand ${name} and its domains?`)) return;
    const r = await adminFetch(`${API}/api/brands/${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (r.ok) {
        showToast(`Deleted ${name}`, 'ok');
        loadCrudData('brands');
        syncCache();
    } else {
        showToast('Delete failed', 'err');
    }
}

// Form Submissions
document.getElementById('form-whitelist').addEventListener('submit', async (e) => {
    e.preventDefault();
    const domain = e.target.domain.value;
    const r = await adminFetch(`${API}/api/whitelist`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({domain, added_by: 'admin'})
    });
    if(r.ok) { showToast('Whitelisted', 'ok'); e.target.reset(); loadCrudData('whitelist'); syncCache(); }
});

document.getElementById('form-blacklist').addEventListener('submit', async (e) => {
    e.preventDefault();
    const domain = e.target.domain.value;
    const r = await adminFetch(`${API}/api/blacklist`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({domain, confidence: 1.0, source: 'admin'})
    });
    if(r.ok) { showToast('Blacklisted', 'ok'); e.target.reset(); loadCrudData('blacklist'); syncCache(); }
});

document.getElementById('form-brand').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = e.target.name.value;
    const display_name = e.target.display_name.value;
    const domain = e.target.domain.value;
    
    const r1 = await adminFetch(`${API}/api/brands`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name, display_name, category: 'other'})
    });
    const r2 = await adminFetch(`${API}/api/brands/domains`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({brand_name: name, domain, is_primary: true})
    });
    
    if(r1.ok && r2.ok) { showToast('Brand Added', 'ok'); e.target.reset(); loadCrudData('brands'); syncCache(); }
});

document.getElementById('form-quiz').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
        domain: fd.get('domain'),
        question_text: fd.get('question_text'),
        options: [fd.get('opt0'), fd.get('opt1'), fd.get('opt2'), fd.get('opt3')],
        correct_index: parseInt(fd.get('correct_index')),
        explanation_text: fd.get('explanation_text')
    };
    const r = await adminFetch(`${API}/api/quiz/questions`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
    if(r.ok) { showToast('Question Added', 'ok'); e.target.reset(); loadCrudData('quiz'); }
});




// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', loadDashboard);
setInterval(loadDashboard, 60_000);

// Expose to window for inline HTML onclick handlers
window.syncCache = syncCache;
window.loadDashboard = loadDashboard;
window.approveDispute = approveDispute;
window.rejectDispute = rejectDispute;
window.logout = logout;
window.deleteItem = deleteItem;
window.deleteBrand = deleteBrand;