/**
 * VerdictBanner — shows DANGEROUS / SAFE + the specific rule that blocked.
 * Reads skip_reason, heuristic.brand_check, heuristic.dga_check, gsb to
 * produce a human-readable "Blocked by: X" chip.
 */
export default function VerdictBanner({ status, result, flaggedCount, totalCount }) {
  const scanning = status === 'scanning'
  const done     = status === 'revealing' || status === 'complete'
  const isPhishing = result?.is_phishing

  if (scanning) return <ScanningState totalCount={totalCount} />
  if (!done)     return null

  const confidence = result?.confidence_score ?? 0
  const blockChip  = done && isPhishing ? buildBlockChip(result) : null

  if (isPhishing) return <PhishingBanner confidence={confidence} flaggedCount={flaggedCount} totalCount={totalCount} blockChip={blockChip} />
  const safeChip = done && !isPhishing ? buildSafeChip(result) : null
  return <SafeBanner totalCount={totalCount} flaggedCount={flaggedCount} confidence={confidence} safeChip={safeChip} />
}

/* ── Block reason chip builder ─────────────────────────── */
function buildBlockChip(result) {
  const h         = result?.heuristic || {}
  const gsb       = result?.gsb
  const skipReason = result?.skip_reason || ''

  // Priority: GSB → Blacklist → Brand → DGA → Structural → ML
  if (gsb?.status === 'malicious') {
    const threats = (gsb.threats || []).map(t =>
      t === 'SOCIAL_ENGINEERING' ? 'Phishing' :
      t === 'MALWARE'            ? 'Malware'  :
      t === 'UNWANTED_SOFTWARE'  ? 'Unwanted Software' : t
    ).join(', ')
    return { icon: '🌐', label: 'Google Safe Browsing', sub: threats, color: 'danger' }
  }

  if (skipReason.includes('blacklisted')) {
    const source = (result?.heuristic?.blacklist_source || 'manual')
    return { icon: '📋', label: 'Blacklist Match', sub: `Source: ${source}`, color: 'danger' }
  }

  const brand = h.brand_check
  if (brand?.verdict === 'block') {
    const ruleLabel = {
      prefix_suffix:   'Prefix/Suffix wrapping',
      typosquatting:   'Typosquatting (fuzzy match)',
      homograph:       'Unicode homograph attack',
      punycode:        'Punycode lookalike',
      tld_squatting:   'TLD squatting (exact name, wrong TLD)',
    }[brand.triggered_rule] || brand.triggered_rule
    return { icon: '🏷️', label: 'Brand Impersonation', sub: `${ruleLabel} — matched "${brand.matched_brand}"`, color: 'danger' }
  }

  const dga = h.dga_check
  if (dga?.verdict === 'block') {
    const dgaDets   = dga.detections || []
    const hardCount = dgaDets.filter(d => d.severity === 'hard').length
    const softCount = dgaDets.filter(d => d.severity === 'soft').length
    const parts = [hardCount > 0 ? `${hardCount} hard` : null, softCount > 0 ? `${softCount} soft` : null].filter(Boolean)
    const sub = parts.length
      ? parts.join(' + ') + ' indicator(s) — machine-generated domain pattern'
      : 'Machine-generated domain detected'
    return { icon: '🤖', label: 'DGA Detection', sub, color: 'danger' }
  }

  // Structural block rule
  const triggered = (h.all_checks || []).filter(c => c.triggered && c.severity === 3)
  if (triggered.length) {
    const ruleLabels = {
      ip_address:    'Raw IP address',
      at_symbol:     '@ symbol redirect trick',
      embedded_http: 'Embedded URL redirect',
      punycode:      'Punycode encoding',
    }
    const topRule = triggered[0]
    return { icon: '🔍', label: 'Heuristic Rule', sub: ruleLabels[topRule.rule] || topRule.rule, color: 'danger' }
  }

  // ML model
  if (!h.ml_skipped && result?.confidence_score > 0.5) {
    return { icon: '🧠', label: 'ML Model', sub: `${Math.round((result?.confidence_score ?? 0) * 100)}% phishing probability`, color: 'warn' }
  }

  return { icon: '⚠️', label: 'Multiple Signals', sub: skipReason || 'Combined heuristic signals', color: 'warn' }
}

function buildSafeChip(result) {
  if (result?.status === 'whitelisted') {
    return { icon: '🛡️', label: 'Whitelist Match', sub: 'Explicitly allowed by administrator', color: 'safe' }
  }
  
  if (result?.status === 'success') {
    const mlConfidence = Math.round((result?.legitimate_confidence ?? 0) * 100)
    return { icon: '🧠', label: 'ML Model', sub: `${mlConfidence}% legitimate probability`, color: 'safe' }
  }
  
  return { icon: '✅', label: 'Heuristic Checks', sub: 'No malicious signals detected', color: 'safe' }
}

/* ── Sub-components ─────────────────────────────────────── */
function ScanningState({ totalCount }) {
  return (
    <div className="rounded-2xl px-6 py-5 flex items-center gap-4 verdict-enter relative overflow-hidden"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-md)' }}>
      <div className="absolute bottom-0 left-0 right-0 h-0.5"
        style={{ background: 'linear-gradient(90deg,transparent,var(--color-info),transparent)', animation: 'scanBar 2s ease-in-out infinite' }} />
      <style>{`@keyframes scanBar{0%,100%{opacity:.3}50%{opacity:1}}`}</style>
      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 scan-pulse"
        style={{ background: 'var(--color-info-bg)', border: '1px solid rgba(56,189,248,0.25)' }}>
        <span style={{ fontSize: 18 }}>🔍</span>
      </div>
      <div>
        <p className="font-display font-bold text-lg" style={{ color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>Scanning…</p>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>Running {totalCount || 22} security checks</p>
      </div>
    </div>
  )
}

function ReasonChip({ chip }) {
  if (!chip) return null
  const colors = {
    danger: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', text: '#fca5a5', subText: 'rgba(252,165,165,0.65)' },
    warn:   { bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.3)', text: '#fde68a', subText: 'rgba(253,230,138,0.65)' },
    safe:   { bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.3)', text: '#6ee7b7', subText: 'rgba(110,231,183,0.7)' },
  }
  const c = colors[chip.color] || colors.danger
  const prefix = chip.color === 'safe' ? 'Allowed by:' : 'Blocked by:'
  
  return (
    <div className="mt-3 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl"
      style={{ background: c.bg, border: `1px solid ${c.border}` }}>
      <span className="text-sm">{chip.icon}</span>
      <div>
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: c.text }}>
          {prefix} {chip.label}
        </span>
        {chip.sub && <p className="text-xs mt-0" style={{ color: c.subText }}>{chip.sub}</p>}
      </div>
    </div>
  )
}

function PhishingBanner({ confidence, flaggedCount, totalCount, blockChip }) {
  return (
    <div className="rounded-2xl px-6 py-5 verdict-enter relative overflow-hidden scanlines"
      style={{ background: 'linear-gradient(135deg,rgba(239,68,68,0.15) 0%,rgba(239,68,68,0.05) 100%)', border: '1px solid rgba(239,68,68,0.4)' }}>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', fontSize: 22 }}>🚨</div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-2xl" style={{ color: '#fca5a5', letterSpacing: '-0.02em' }}>DANGEROUS — Do not visit</p>
          <p className="text-sm mt-1" style={{ color: 'rgba(252,165,165,0.75)' }}>
            This URL shows signs of phishing. It may steal your personal information or credentials.
          </p>
          <div className="flex flex-wrap gap-2 mt-2.5">
            <span className="text-xs font-bold px-3 py-1 rounded-full"
              style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5' }}>
              {flaggedCount} of {totalCount} checks flagged
            </span>
            {confidence != null && (
              <span className="text-xs px-3 py-1 rounded-full"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
                {Math.round(confidence * 100)}% confidence
              </span>
            )}
          </div>
          <ReasonChip chip={blockChip} />
        </div>
      </div>
    </div>
  )
}

function SafeBanner({ totalCount, flaggedCount, confidence, safeChip }) {
  return (
    <div className="rounded-2xl px-6 py-5 verdict-enter relative overflow-hidden scanlines"
      style={{ background: 'linear-gradient(135deg,rgba(52,211,153,0.1) 0%,rgba(52,211,153,0.04) 100%)', border: '1px solid rgba(52,211,153,0.3)' }}>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', fontSize: 22 }}>✅</div>
        <div className="flex-1">
          <p className="font-display font-bold text-2xl" style={{ color: '#6ee7b7', letterSpacing: '-0.02em' }}>Looks safe</p>
          <p className="text-sm mt-1" style={{ color: 'rgba(110,231,183,0.7)' }}>
            No major threats detected. Still, always verify the address bar before entering any personal data.
          </p>
          <div className="flex flex-wrap gap-2 mt-2.5">
            <span className="text-xs font-bold px-3 py-1 rounded-full"
              style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', color: '#6ee7b7' }}>
              {totalCount - flaggedCount} of {totalCount} checks passed
            </span>
            {confidence != null && (
              <span className="text-xs px-3 py-1 rounded-full"
                style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', color: '#6ee7b7' }}>
                {Math.round(confidence * 100)}% confidence
              </span>
            )}
          </div>
          <ReasonChip chip={safeChip} />
        </div>
      </div>
    </div>
  )
}
