/**
 * useQuizProgress.js
 * ──────────────────
 * Manages the user's quiz progress in browser localStorage.
 *
 * Stored shape (key: 'LearnPhish_quiz'):
 * {
 *   total_answered: number,
 *   total_correct:  number,
 *   answered_ids:   number[]   ← sent to backend as exclude_ids
 * }
 *
 * No user account is required. Progress persists across sessions.
 * Clearing browser data resets progress — this is intentional.
 */

import { useState, useCallback } from 'react'

const STORAGE_KEY = 'LearnPhish_quiz'

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { total_answered: 0, total_correct: 0, answered_ids: [] }
    return JSON.parse(raw)
  } catch {
    return { total_answered: 0, total_correct: 0, answered_ids: [] }
  }
}

function saveProgress(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // localStorage may be unavailable in private browsing — fail silently
  }
}

export function useQuizProgress() {
  const [progress, setProgress] = useState(loadProgress)

  /**
   * Call after the user submits an answer.
   * @param {number} questionId - The question ID to mark as answered
   * @param {boolean} isCorrect - Whether the user answered correctly
   */
  const recordAnswer = useCallback((questionId, isCorrect) => {
    setProgress(prev => {
      // Avoid double-counting if called twice for the same question
      if (prev.answered_ids.includes(questionId)) return prev

      const next = {
        total_answered: prev.total_answered + 1,
        total_correct:  prev.total_correct + (isCorrect ? 1 : 0),
        answered_ids:   [...prev.answered_ids, questionId],
      }
      saveProgress(next)
      return next
    })
  }, [])

  /**
   * Reset all progress — useful for a "Start Over" button.
   */
  const resetProgress = useCallback(() => {
    const blank = { total_answered: 0, total_correct: 0, answered_ids: [] }
    saveProgress(blank)
    setProgress(blank)
  }, [])

  return {
    progress,        // { total_answered, total_correct, answered_ids }
    recordAnswer,
    resetProgress,
  }
}
