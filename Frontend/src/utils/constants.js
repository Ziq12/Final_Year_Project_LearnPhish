/**
 * constants.js
 * Centralised config — colours, labels, group order, URL part definitions.
 * Change a colour or label here and it updates everywhere.
 */

// ── Severity → Tailwind classes ───────────────────────────────
export const SEVERITY = {
  danger: {
    bg:         'bg-red-50',
    border:     'border-l-red-500',
    text:       'text-red-700',
    iconBg:     'bg-red-100',
    badgeBg:    'bg-red-100 text-red-700',
    segmentHL:  'bg-red-100 ring-2 ring-red-400',
    dot:        'bg-red-500',
  },
  suspicious: {
    bg:         'bg-amber-50',
    border:     'border-l-amber-500',
    text:       'text-amber-700',
    iconBg:     'bg-amber-100',
    badgeBg:    'bg-amber-100 text-amber-700',
    segmentHL:  'bg-amber-100 ring-2 ring-amber-400',
    dot:        'bg-amber-500',
  },
  safe: {
    bg:         'bg-green-50',
    border:     'border-l-green-500',
    text:       'text-green-700',
    iconBg:     'bg-green-100',
    badgeBg:    'bg-green-100 text-green-700',
    segmentHL:  'bg-green-100 ring-2 ring-green-400',
    dot:        'bg-green-500',
  },
  pending: {
    bg:         'bg-slate-50',
    border:     'border-l-slate-300',
    text:       'text-slate-400',
    iconBg:     'bg-slate-100',
    badgeBg:    'bg-slate-100 text-slate-500',
    segmentHL:  '',
    dot:        'bg-slate-300',
  },
}

// ── URL part → label + which severity to highlight ────────────
export const URL_PARTS = {
  protocol:  { label: 'Protocol',  color: 'text-blue-600',   highlightClass: 'bg-blue-50 ring-2 ring-blue-300' },
  subdomain: { label: 'Subdomain', color: 'text-purple-600', highlightClass: 'bg-purple-50 ring-2 ring-purple-300' },
  domain:    { label: 'Domain',    color: 'text-slate-800',  highlightClass: 'bg-slate-100 ring-2 ring-slate-400' },
  tld:       { label: 'TLD',       color: 'text-orange-600', highlightClass: 'bg-orange-50 ring-2 ring-orange-300' },
  path:      { label: 'Path',      color: 'text-teal-600',   highlightClass: 'bg-teal-50 ring-2 ring-teal-300' },
  query:     { label: 'Query',     color: 'text-indigo-600', highlightClass: 'bg-indigo-50 ring-2 ring-indigo-300' },
  full:      { label: 'Full URL',  color: 'text-red-600',    highlightClass: 'bg-red-50 ring-2 ring-red-300' },
}

// ── Groups — which URL parts each group primarily concerns ────
// Used by MiniURLStrip to decide which segments to emphasise.
export const GROUP_FOCUS_PARTS = {
  'Web Address & Technical Checks': ['protocol', 'full', 'subdomain', 'path', 'query'],
  'Brand Impersonation Check':      ['subdomain', 'domain', 'tld'],
  'Domain Name Analysis (DGA)':     ['domain', 'subdomain'],
  'Machine Learning Analysis':      ['full'],
}

// ── Animation timing (ms) ─────────────────────────────────────
export const REVEAL_DELAY_PER_ITEM = 90   // gap between items revealing
export const REVEAL_GROUP_GAP      = 200  // extra gap between groups
export const REVEAL_ITEM_DURATION  = 300  // how long each item's transition takes

// ── Example URLs for HomePage ─────────────────────────────────
export const EXAMPLE_URLS = [
  {
    url:     'https://login.paypal.secure-update.com/verify?redirect=paypal.com',
    label:   'Phishing example',
    description: 'Looks like PayPal but the real domain is "secure-update.com"',
    expected: 'phishing',
  },
  {
    url:     'https://www.google.com',
    label:   'Safe example',
    description: 'Real Google — domain is exactly "google.com"',
    expected: 'legitimate',
  },
  {
    url:     'http://xqjpvflnrtzmbws.ru/login',
    label:   'Machine-generated domain',
    description: 'No real words — looks like a computer made up the name',
    expected: 'phishing',
  },
]
