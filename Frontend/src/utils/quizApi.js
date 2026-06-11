/**
 * quizApi.js
 * ──────────
 * API helpers for the Quiz module.
 *
 * fetchQuestion  — POST /api/quiz/fetch  (returns question WITHOUT the answer)
 * submitAnswer   — POST /api/quiz/answer (returns { is_correct, explanation_text })
 *
 * Both are plain async functions — no state, no hooks.
 * Import and call them from components or other hooks.
 */

/**
 * Fetch a random unanswered question for a given threat domain.
 *
 * @param {string}   domain      - e.g. "Obfuscation & Cloaking"
 * @param {number[]} excludeIds  - IDs already answered (from localStorage)
 * @returns {Promise<{id: number, question_text: string, options: string[]} | null>}
 *          Returns null when all questions for this domain are exhausted (HTTP 204).
 */
export async function fetchQuestion(domain, excludeIds = []) {
  const apiBase = import.meta.env.VITE_API_URL || '';
  const res = await fetch(`${apiBase}/api/quiz/fetch`, {
    method:  'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_FRONTEND_API_KEY
    },
    body:    JSON.stringify({ domain, exclude_ids: excludeIds }),
  })

  // 204 = No Content → all questions answered for this domain
  if (res.status === 204) return null

  if (!res.ok) {
    console.error('[QuizAPI] fetchQuestion failed:', res.status)
    return null
  }

  return res.json()
}

/**
 * Submit the user's answer and receive the result.
 *
 * @param {number} questionId     - The ID returned by fetchQuestion
 * @param {number} selectedIndex  - 0-based index of the user's chosen option
 * @returns {Promise<{is_correct: boolean, explanation_text: string} | null>}
 */
export async function submitAnswer(questionId, selectedIndex) {
  const apiBase = import.meta.env.VITE_API_URL || '';
  const res = await fetch(`${apiBase}/api/quiz/answer`, {
    method:  'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_FRONTEND_API_KEY
    },
    body:    JSON.stringify({ question_id: questionId, selected_index: selectedIndex }),
  })

  if (!res.ok) {
    console.error('[QuizAPI] submitAnswer failed:', res.status)
    return null
  }

  return res.json()
}
