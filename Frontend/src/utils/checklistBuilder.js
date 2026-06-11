/**
 * checklistBuilder.js
 * Converts the API response into structured checklist groups.
 * All checks always shown — pass (✅) or fail (❌).
 * Same logic as the vanilla JS version, ported to ES module.
 */

// ── Static check definitions ──────────────────────────────────
const STRUCTURAL_CHECKS = [
  { rule: 'ip_address',           severity: 'danger',     part: 'full',
    textFail: 'Uses a number (IP address) instead of a real domain name',
    textPass: 'Uses a proper named domain, not a raw IP address',
    tipFail:  'Real websites always use names like google.com. Numbers like 192.168.1.1 are ussually used for phising websites.',
    tipPass:  'Good, this URL uses a proper named domain.' },

  { rule: 'punycode',             severity: 'danger',     part: 'domain',
    textFail: 'Punycode (xn--) detected in the domain. Uses special look-alike characters to disguise the domain',
    textPass: 'No Punycode (xn--) detected in the domain name. Domain name uses only normal, readable characters',
    tipFail:  'Attackers swap letters with look-alike characters from other languages to fake brand names.',
    tipPass:  'Good, no hidden character tricks detected.' },

  { rule: 'suspicious_tld',       severity: 'suspicious', part: 'tld',
    textFail: 'Uses a cheap, suspicious domain ending (.xyz, .top, .gq…)',
    textPass: 'Domain ending is not on the suspicious list',
    tipFail:  'Scammers use cheap or free domain endings. Real brands almost always use .com, .org, or country codes.',
    tipPass:  'Good, this domain ending is not commonly phishing abused.' },

  { rule: 'no_https',             severity: 'suspicious', part: 'protocol',
    textFail: 'Does not use a secure HTTPS connection',
    textPass: 'Uses secure HTTPS encryption',
    tipFail:  'Legitimate sites use "https://". Without it, anything you type could be intercepted and read by third parties.',
    tipPass:  'Good, the connection is encrypted with HTTPS, so your data is safe from being stolen.' },

  { rule: 'excessive_subdomains', severity: 'suspicious', part: 'subdomain',
    textFail: 'Has too many sections before the main domain name',
    textPass: 'Subdomain depth looks normal',
    tipFail:  'Attackers add extra sections to hide the real domain and confiuse you into thinking that the website is real, so be careful!',
    tipPass:  'Good, the subdomain depth is within normal range.' },

  { rule: 'long_url',             severity: 'suspicious', part: 'full',
    textFail: 'The web address is unusually long and hard to read',
    textPass: 'Web address length looks normal',
    tipFail:  'Very long URLs hide the real domain — the dangerous part is buried in the middle.',
    tipPass:  'Good, the web address length is within normal range.' },

  { rule: 'phish_keyword',        severity: 'suspicious', part: 'path',
    textFail: 'Contains a suspicious word like "login", "verify", or "secure"',
    textPass: 'No suspicious phishing keywords found in the URL address',
    tipFail:  'These words make fake pages look like real login or security pages or goverment rewards.If fallen to this trap your credential may be stolen.',
    tipPass:  'Good, no suspicious phishing keywords found in the URL address.' },

  { rule: 'at_symbol',            severity: 'danger',     part: 'full',
    textFail: 'Contains an "@" sign to hides the real destination',
    textPass: 'No "@" symbol in the URL',
    tipFail:  'Browsers ignore everything before "@". So "paypal.com@evil.com" takes you to evil.com website.',
    tipPass:  'Good, no "@" redirection trick detected.' },

  { rule: 'double_slash',         severity: 'suspicious', part: 'path',
    textFail: 'Has a double slash "//" inside the address path',
    textPass: 'No double-slash redirection trick in the path',
    tipFail:  'A "//" inside the path is used to confuse browsers into loading a different location.',
    tipPass:  'Good, no double-slash tricks found.' },

  { rule: 'embedded_http',        severity: 'danger',     part: 'query',
    textFail: 'Contains another web address hidden inside this link',
    textPass: 'No hidden web address inside this URL',
    tipFail:  'Attackers embed a second URL to redirect you to a phishing page after the real site loads.',
    tipPass:  'Good, no embedded URL detected.' },
]

// ── DGA rule label map — human-readable names for detection rules ─────
const DGA_RULE_LABELS = {
  pure_numeric:       { label: 'Pure Numeric Label',           part: 'domain' },
  zero_vowels_mixed:  { label: 'Zero Vowels (Mixed)',          part: 'domain' },
  ipfs_cid:           { label: 'IPFS/Crypto Hash',             part: 'domain' },
  hex_hash:           { label: 'Hex Hash (MD5/SHA256)',        part: 'domain' },
  base32_hash:        { label: 'Base32 Hash',                  part: 'domain' },
  numeric_padding:    { label: 'Numeric Padding',              part: 'domain' },
  mixed_alphanumeric: { label: 'Long Mixed Alphanumeric',      part: 'domain' },
  high_entropy:       { label: 'High Entropy (Randomness)',    part: 'domain' },
  low_vowel_ratio:    { label: 'Low Vowel Ratio',              part: 'domain' },
  consonant_cluster:  { label: 'Consonant Cluster',           part: 'domain' },
  high_digit_ratio:   { label: 'High Digit Ratio',            part: 'domain' },
}

// ── DGA tip map — educational tips per rule ───────────────────
const DGA_RULE_TIPS = {
  pure_numeric:       'Real domain labels use names, not plain numbers. A numeric-only label (e.g. 545665654.vercel.app) is characteristic of auto-generated phishing infrastructure.',
  zero_vowels_mixed:  'A label mixing letters and digits but having zero vowels is almost never a real word — bots generate these strings to create unique-looking phishing URLs.',
  ipfs_cid:           'IPFS Content Identifiers are cryptographic hashes used to host content on the decentralised web. Phishers abuse IPFS to host phishing pages that are hard to take down.',
  hex_hash:           'A string of exactly 32 or 64 hex characters is an MD5 or SHA-256 hash — these are used as random subdomain labels in DGA-generated infrastructure.',
  base32_hash:        'A long Base32 string is a computer-generated label, not a human-chosen name. It is commonly seen in botnet command-and-control and phishing domains.',
  numeric_padding:    'Appending long random numbers after a hyphen (e.g. free-5520723.site) is a mass-campaign trick to generate thousands of unique URLs from one domain.',
  mixed_alphanumeric: 'A long string of random letters and numbers without hyphens (e.g. poiaqewsxcbcgtrt566655) is a signature of automated domain generation algorithms (DGA).',
  high_entropy:       'Shannon entropy measures how evenly characters are distributed. Very high entropy (above 3.5 in a long label) suggests the string was generated by a machine, not chosen by a human.',
  low_vowel_ratio:    'Real words in any language contain roughly 30-40% vowels. When less than 15% of letters are vowels, the string is likely machine-generated.',
  consonant_cluster:  'Natural language rarely puts more than 4 consonants in a row. Longer runs (e.g. "zrtplk") are a hallmark of randomly generated domain strings.',
  high_digit_ratio:   'Legitimate domain names rarely contain many digits. When 40% or more of characters are numbers (in a mixed label), it signals automated generation.',
}

// ── Brand helper ──────────────────────────────────────────────
function brandFailText(bc) {
  if (!bc) return null
  if (bc.triggered_rule === 'homograph')    return `Uses look-alike letters to fake "${bc.matched_brand}" — homograph attack`
  if (bc.triggered_rule === 'typosquatting') return `Name is ${bc.similarity_score ? Math.round(bc.similarity_score * 100) + '% ' : ''}similar to "${bc.matched_brand}" — typosquatting`
  if (bc.triggered_rule === 'prefix_suffix') return `"${bc.matched_brand}" is wrapped with extra words — impersonation trick`
  return bc.message || null
}

// ── Index helper ──────────────────────────────────────────────
function indexBy(arr, key) {
  const m = {}
  ;(arr || []).forEach(item => { m[item[key]] = item })
  return m
}

// ── Main export ───────────────────────────────────────────────
export function buildChecklist(data) {
  const h  = data?.heuristic || {}
  const ex = data?.explain   || {}

  const structByRule = indexBy(h.all_checks || [], 'rule')
  const dga          = h.dga_check
  const bc           = h.brand_check
  const groups       = []

  // ── Group 1: Web Address & Technical Checks ──────────────
  groups.push({
    id:    'structural',
    name:  'Website Address Safety Check',
    items: STRUCTURAL_CHECKS.map((def, i) => {
      const backend   = structByRule[def.rule]
      const triggered = backend?.triggered ?? false
      return {
        id:       `s_${i}`,
        text:     triggered ? (def.textFail || backend?.message) : def.textPass,
        tip:      triggered ? def.tipFail : def.tipPass,
        part:     def.part,
        severity: triggered ? def.severity : 'safe',
        present:  triggered,
        measured: backend?.measured_value || '',
      }
    }),
  })

  // ── Group 2: Brand Impersonation ─────────────────────────
  const brandTriggered = bc && bc.verdict !== 'pass'
  groups.push({
    id:   'brand',
    name: 'Brand Impersonation Check',
    items: [{
      id:             'brand_main',
      text:           brandTriggered
                        ? (brandFailText(bc) || bc.message)
                        : 'Domain does not appear to impersonate a known brand. But do recheck domain name carefully.',
      tip:            brandTriggered
                        ? (bc.message || 'Brand impersonation detected.')
                        : 'Good, no known brand is being faked by this domain. But phising websites often use similar name with brand names to confuse users. Take note of this pattern.',
      part:           'domain',
      severity:       brandTriggered ? (bc.verdict === 'block' ? 'danger' : 'suspicious') : 'safe',
      present:        brandTriggered,
      measured:       bc?.matched_brand ? `matched: ${bc.matched_brand}` : '',
      officialDomain: brandTriggered && bc.matched_brand ? `${bc.matched_brand}.com` : null,
      fakeUrl:        brandTriggered ? data?.url : null,
    }],
  })

  // ── Group 3: Domain Name Analysis (DGA) ──────────────────
  // New schema: dga_check.detections[] — each has rule, label, reason, severity ("hard"|"soft")
  const dgaVerdict    = dga?.verdict ?? 'pass'
  const dgaDetections = dga?.detections || []
  const dgaHardCount  = dgaDetections.filter(d => d.severity === 'hard').length
  const dgaSoftCount  = dgaDetections.filter(d => d.severity === 'soft').length
  const dgaTitleParts = [
    dgaHardCount > 0 ? `${dgaHardCount} hard` : null,
    dgaSoftCount > 0 ? `${dgaSoftCount} soft` : null,
  ].filter(Boolean)
  const dgaGroupTitle = dgaVerdict === 'pass'
    ? 'Generated / Random URL Check — Clean'
    : `Generated / Random URL Check — ${dgaTitleParts.join(' + ')} indicator(s)`

  const dgaItems = dgaDetections.length > 0
    ? dgaDetections.map((det, i) => {
        const meta = DGA_RULE_LABELS[det.rule] || { label: det.rule, part: 'domain' }
        const tip  = DGA_RULE_TIPS[det.rule] || det.reason
        return {
          id:       `dga_${i}`,
          text:     `${meta.label}: ${det.reason}`,
          tip,
          part:     meta.part,
          severity: det.severity === 'hard' ? 'danger' : 'suspicious',
          present:  true,
          measured: det.label || '',
        }
      })
    : [{
        id:       'dga_clean',
        text:     'No machine-generation or phishing infrastructure patterns detected in the domain',
        tip:      'The domain structure passed all DGA checks — no hash-like labels, numeric padding, or abused hosting patterns were found.',
        part:     'domain',
        severity: 'safe',
        present:  false,
        measured: '',
      }]

  groups.push({ id: 'dga', name: dgaGroupTitle, items: dgaItems })

  // ── Group 4: Machine Learning Analysis ───────────────────
  const ML_PART = {
    have_IP:'full', url_shortening:'full', https_token:'protocol',
    brand_in_domain:'domain', brand_in_subdomain:'subdomain', brand_in_path:'path',
    phish_hint:'path', suspicious_tld:'tld', url_entropy:'full', domain_entropy:'domain',
    path_entropy:'path', url_length:'full', hostname_length:'domain', count_subdomain:'subdomain',
    count_dots:'full', has_query:'query', has_sensitive_query_key:'query', has_url_in_query:'query',
    count_hyphens:'domain', count_at:'full', prefix_suffix:'domain', has_port:'domain',
    has_tld_in_path:'path', has_tld_in_subdomain:'subdomain',
  }
  const mlFeatures = (ex.triggered_features || [])
  const mlItems = h.ml_skipped
    ? [{ id:'ml_skip', text:'ML model was not needed, a phishing pattern have been detected. ',
         tip:'When a very strong indicator is found, the ML model is skipped to save time.',
         part:'full', severity:'safe', present:false, measured:'' }]
    : mlFeatures.length
      ? mlFeatures.map((f, i) => ({
          id:`ml_${i}`, text:f.explanation,
          tip:`Feature: ${f.name} = ${f.value}. ${f.explanation}`,
          part: ML_PART[f.name] || 'full',
          severity: f.severity >= 3 ? 'danger' : 'suspicious',
          present:true, measured: String(f.value ?? ''),
        }))
      : [{ id:'ml_clean', text:'Machine learning model found no significant phishing patterns',
           tip:'The ML model analysed 56 URL features and found no strong phishing signals.',
           part:'full', severity:'safe', present:false, measured:'' }]

  groups.push({ id:'ml', name:'Machine Learning Analysis', items: mlItems })

  return groups
}
