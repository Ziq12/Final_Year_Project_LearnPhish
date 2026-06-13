import { create } from 'zustand'

// ─────────────────────────────────────────────────────────────────
// Error type catalogue
// Each type maps to a distinct UI treatment in ErrorDisplay.jsx
// ─────────────────────────────────────────────────────────────────
export const ERROR_TYPES = {
  RATE_LIMIT:           'rate_limit',
  CONNECTION_ERROR:     'connection_error',
  SERVER_ERROR:         'server_error',
  SERVICE_UNAVAILABLE:  'service_unavailable',
  UNAUTHORIZED:         'unauthorized',
  INVALID_URL:          'invalid_url',
  UNKNOWN:              'unknown',
}

/**
 * parseHttpError(status, body)
 * Converts an HTTP error status code + optional response body
 * into a structured error object for the UI to render.
 *
 * @param {number}      status  HTTP status code (0 = network-level failure)
 * @param {object|null} body    Parsed JSON body from the error response, may be null
 * @param {boolean}     isNetwork  true when fetch() itself threw (no HTTP response)
 * @returns {{ type, message, status, retryAfter? }}
 */
function parseHttpError(status, body, isNetwork = false) {
  // Network-level failure: no HTTP response reached the client
  if (isNetwork || status === 0) {
    return {
      type:    ERROR_TYPES.CONNECTION_ERROR,
      message: "Can't reach the server. Check your internet connection.",
      status:  0,
    }
  }

  // Prefer the backend's structured message when present
  const serverMessage = body?.message || null

  switch (status) {
    case 429: {
      // Respect Retry-After from the response body; fall back to 60 s
      const retryAfter = typeof body?.retry_after === 'number'
        ? body.retry_after
        : 60
      return {
        type:       ERROR_TYPES.RATE_LIMIT,
        message:    serverMessage ?? "You're scanning too fast. Please wait before trying again.",
        status:     429,
        retryAfter,
      }
    }

    case 401:
    case 403:
      return {
        type:    ERROR_TYPES.UNAUTHORIZED,
        message: serverMessage ?? 'API authentication failed. Check your configuration.',
        status,
      }

    case 422:
      return {
        type:    ERROR_TYPES.INVALID_URL,
        message: serverMessage ?? 'Please enter a valid URL (e.g. https://example.com).',
        status:  422,
      }

    case 503:
      return {
        type:    ERROR_TYPES.SERVICE_UNAVAILABLE,
        message: serverMessage ?? 'The ML analysis service is temporarily offline. Try again shortly.',
        status:  503,
      }

    default:
      if (status >= 500) {
        return {
          type:    ERROR_TYPES.SERVER_ERROR,
          message: serverMessage ?? 'A server error occurred. Please try again.',
          status,
        }
      }
      return {
        type:    ERROR_TYPES.UNKNOWN,
        message: serverMessage ?? `Unexpected response (HTTP ${status}). Please try again.`,
        status,
      }
  }
}

// ─────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────
const useScanStore = create((set, get) => ({
  url:    '',
  result: null,

  // 'idle' | 'scanning' | 'revealing' | 'complete' | 'error'
  status: 'idle',

  // null | { type, message, status, retryAfter? }
  error:  null,

  // Quiz state — fully decoupled from scan result
  prescanDismissed:   false,
  prefetchedQuestion: undefined, // populated by useQuizPrefetch on HomePage

  // ── Main scan action ────────────────────────────────────────
  startScan: async (url) => {
    set({
      url,
      status:           'scanning',
      result:           null,
      error:            null,
      prescanDismissed: false,
      // prefetchedQuestion is intentionally NOT reset — it was pre-fetched on
      // the HomePage and must survive navigation to Result2Page.
    })

    try {
      const apiBase = import.meta.env.VITE_API_URL || ''
      const res = await fetch(`${apiBase}/api/predict`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key':    import.meta.env.VITE_FRONTEND_API_KEY,
        },
        body: JSON.stringify({ url }),
      })

      // Always attempt to parse the body — we need it for structured error messages
      // even when res.ok is false (the backend now returns { message, error_code, … }).
      let body = null
      try { body = await res.json() } catch (_) { /* ignore parse failure */ }

      // ── Non-2xx: map HTTP status → structured error ──────────
      if (!res.ok) {
        set({ error: parseHttpError(res.status, body), status: 'error' })
        return
      }

      // ── 200 but backend signalled failure (legacy / fallback) ─
      // The new backend raises proper HTTP errors, but guard against
      // old-style { error: "…" } in case of partial rollout.
      if (body?.error && typeof body.error === 'string') {
        set({
          error:  { type: ERROR_TYPES.SERVER_ERROR, message: body.error, status: 200 },
          status: 'error',
        })
        return
      }

      // ── Success ──────────────────────────────────────────────
      // Scan result ready — quiz visibility is the component's responsibility.
      set({ result: body, status: 'revealing' })

    } catch (err) {
      // fetch() itself threw: network unreachable, CORS pre-flight blocked, etc.
      set({
        error:  parseHttpError(0, null, /* isNetwork= */ true),
        status: 'error',
      })
    }
  },

  // ── Retry: re-run the last URL ──────────────────────────────
  retryScan: () => {
    const url = get().url
    if (url) get().startScan(url)
  },

  // ── Quiz helpers ─────────────────────────────────────────────
  /** Called by PreScanQuiz when the user picks an answer (for progress tracking). */
  setPrescanAnswered: () => {},  // no-op — kept so PreScanQuiz import doesn't break

  dismissPrescan:       () => set({ prescanDismissed: true, prefetchedQuestion: undefined }),
  setComplete:          () => set({ status: 'complete' }),
  setPrefetchedQuestion: (q) => set({ prefetchedQuestion: q }),

  // ── Reset ────────────────────────────────────────────────────
  reset: () => set({
    url:                '',
    result:             null,
    status:             'idle',
    error:              null,
    prescanDismissed:   false,
    prefetchedQuestion: undefined,
  }),
}))

export default useScanStore
