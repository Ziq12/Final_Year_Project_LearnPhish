import { useEffect, useRef } from 'react'
import { fetchQuestion } from '../utils/quizApi'
import { useQuizProgress } from './useQuizProgress'
import useScanStore from '../store/useScanStore'

/**
 * useQuizPrefetch
 * ───────────────
 * Silently fetches a quiz question on the HomePage and stores it in Zustand.
 * Because we update the STORE (not component state), there is NO isMounted
 * guard — it is safe to call setPrefetchedQuestion even after HomePage unmounts.
 * This means the question is available instantly on Result2Page regardless of
 * how quickly the user clicks Scan after landing on the HomePage.
 */
export function useQuizPrefetch() {
  const { progress } = useQuizProgress()
  const setPrefetchedQuestion = useScanStore(s => s.setPrefetchedQuestion)
  const prefetchedQuestion    = useScanStore(s => s.prefetchedQuestion)

  // Prevents double-fetch in React StrictMode (two effect invocations)
  const fetchedRef = useRef(false)

  useEffect(() => {
    // Skip if already fetched this session or if a question is already cached
    if (fetchedRef.current || prefetchedQuestion !== undefined) return
    fetchedRef.current = true

    // No isMounted guard — Zustand store updates are safe from anywhere
    fetchQuestion('pre_scan', progress.answered_ids)
      .then(q  => setPrefetchedQuestion(q))
      .catch(() => setPrefetchedQuestion(null))
  }, [progress.answered_ids, prefetchedQuestion, setPrefetchedQuestion])
}
