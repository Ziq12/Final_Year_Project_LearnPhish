import { create } from 'zustand'
import { fetchQuestion } from '../api/quizApi'

// ─────────────────────────────────────────────────────────────────
// Error type catalogue
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

function parseHttpError(status, body, isNetwork = false) {
  if (isNetwork || status === 0) {
    return {
      type:    ERROR_TYPES.CONNECTION_ERROR,
      message: "Can't reach the server. Check your internet connection.",
      status:  0,
    }
  }

  const serverMessage = body?.message || null

  switch (status) {
    case 429: {
      const retryAfter = typeof body?.retry_after === 'number' ? body.retry_after : 60
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
  status: 'idle',
  error:  null,
  
  prescanDismissed:   false,
  prefetchedQuestion: undefined, 

  // ── Main scan action ────────────────────────────────────────
  startScan: async (url) => {
    // 1. Reset state and show loading skeleton for the quiz
    set({
      url,
      status: 'scanning',
      result: null,
      error: null,
      prescanDismissed: false,
      prefetchedQuestion: undefined, // Tells Result2Page to show the "Scanning..." loader
    })

    try {
      const apiBase = import.meta.env.VITE_API_URL || ''
      
      // 2. Define Scan API call
      const scanPromise = fetch(`${apiBase}/api/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_FRONTEND_API_KEY,
        },
        body: JSON.stringify({ url }),
      })

      // 3. Define Quiz API call using your centralized helper!
      const excludeIds = JSON.parse(localStorage.getItem('answered_quiz_ids') || '[]')
      const quizPromise = fetchQuestion("pre_scan", excludeIds)

      // 4. Execute both simultaneously
      const [scanRes, quizQuestion] = await Promise.all([scanPromise, quizPromise])

      // 5. Store the quiz question immediately
      // Note: If the "pre_scan" domain has no questions left, fetchQuestion 
      // returns null. Result2Page's useEffect will see null and auto-dismiss 
      // the skeleton so the user isn't stuck.
      set({ prefetchedQuestion: quizQuestion })

      // Always attempt to parse the body for structured error messages
      let body = null
      try { body = await scanRes.json() } catch (_) { /* ignore parse failure */ }

      // ── Non-2xx: map HTTP status → structured error ──────────
      if (!scanRes.ok) {
        set({ error: parseHttpError(scanRes.status, body), status: 'error' })
        return
      }

      // ── 200 but backend signalled failure (legacy / fallback) ─
      if (body?.error && typeof body.error === 'string') {
        set({
          error: { type: ERROR_TYPES.SERVER_ERROR, message: body.error, status: 200 },
          status: 'error',
        })
        return
      }

      // ── Success ──────────────────────────────────────────────
      set({ result: body, status: 'revealing' })

    } catch (err) {
      // fetch() itself threw: network unreachable, CORS pre-flight blocked, etc.
      set({
        error: parseHttpError(0, null, /* isNetwork= */ true),
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
  setPrescanAnswered: () => {},  
  dismissPrescan:       () => set({ prescanDismissed: true, prefetchedQuestion: undefined }),
  setComplete:          () => set({ status: 'complete' }),
  setPrefetchedQuestion: (q) => set({ prefetchedQuestion: q }),

  // ── Reset ────────────────────────────────────────────────────
  reset: () => set({
    url: '',
    result: null,
    status: 'idle',
    error: null,
    prescanDismissed: false,
    prefetchedQuestion: undefined,
  }),
}))

export default useScanStore