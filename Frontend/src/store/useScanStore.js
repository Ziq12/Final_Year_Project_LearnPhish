import { create } from 'zustand'

const useScanStore = create((set, get) => ({
  url: '',
  result: null,
  status: 'idle',
  error: null,

  // Quiz state — fully decoupled from scan result
  prescanDismissed: false,
  prefetchedQuestion: undefined, // populated by useQuizPrefetch on HomePage

  startScan: async (url) => {
    set({
      url,
      status: 'scanning',
      result: null,
      error: null,
      prescanDismissed: false,
      // prefetchedQuestion is intentionally NOT reset — it was pre-fetched on
      // the HomePage and must survive the navigation to Result2Page.
    })

    try {
      const apiBase = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiBase}/api/predict`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_FRONTEND_API_KEY
        },
        body: JSON.stringify({ url }),
      })
      if (!res.ok) throw new Error(`Server error: ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      // Scan result ready — quiz visibility is the component's responsibility.
      set({ result: data, status: 'revealing' })
    } catch (err) {
      set({ error: err.message, status: 'idle' })
    }
  },

  retryScan: () => {
    const url = get().url
    if (url) get().startScan(url)
  },

  /** Called by PreScanQuiz when the user picks an answer (for progress tracking). */
  setPrescanAnswered: () => {},   // no-op — kept so PreScanQuiz import doesn't break

  dismissPrescan: () => set({ prescanDismissed: true, prefetchedQuestion: undefined }),
  setComplete:    () => set({ status: 'complete' }),

  reset: () => set({
    url: '',
    result: null,
    status: 'idle',
    error: null,
    prescanDismissed: false,
    prefetchedQuestion: undefined,
  }),

  setPrefetchedQuestion: (q) => set({ prefetchedQuestion: q }),
}))

export default useScanStore
