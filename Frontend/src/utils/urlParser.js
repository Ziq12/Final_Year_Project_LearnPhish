/**
 * urlParser.js
 * Reads backend parsed_url (from tldextract).
 * Falls back to client-side parsing only if backend data missing.
 */

export function getParsedUrl(data) {
  if (data?.parsed_url) return data.parsed_url

  // Client-side fallback (approximate — multi-part TLDs may be wrong)
  try {
    const u     = new URL(data?.url?.includes('://') ? data.url : 'https://' + data?.url)
    const parts = u.hostname.split('.')
    return {
      protocol:  u.protocol.replace(':', ''),
      subdomain: parts.length > 2 ? parts.slice(0, -2).join('.') : '',
      domain:    parts.length >= 2 ? parts[parts.length - 2] : parts[0],
      tld:       parts.length >= 2 ? parts[parts.length - 1] : '',
      path:      u.pathname !== '/' ? u.pathname : '',
      query:     u.search || '',
      hostname:  u.hostname,
      full:      data?.url || '',
    }
  } catch {
    return { protocol:'', subdomain:'', domain: data?.url||'', tld:'', path:'', query:'', hostname:'', full: data?.url||'' }
  }
}
