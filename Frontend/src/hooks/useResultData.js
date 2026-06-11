/**
 * useResultData.js
 * Shared hook for all three result pages.
 * Returns everything needed to render a result view.
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useScanStore from '../store/useScanStore'
import { useAnimatedChecklist } from './useAnimatedChecklist'
import { buildChecklist }       from '../utils/checklistBuilder'
import { getParsedUrl }         from '../utils/urlParser'

export function useResultData() {
  const navigate = useNavigate()
  const status   = useScanStore(s => s.status)
  const result   = useScanStore(s => s.result)
  const scanUrl  = useScanStore(s => s.url)
  const error    = useScanStore(s => s.error)
  const reset    = useScanStore(s => s.reset)

  useEffect(() => {
    if (status === 'idle' && !result && !error) {
      navigate('/', { replace: true })
    }
  }, [status, result, error, navigate])

  const groups    = result ? buildChecklist(result) : []
  const parsedUrl = result ? getParsedUrl(result)   : null
  const revealed  = useAnimatedChecklist(groups)

  const totalCount   = groups.reduce((s, g) => s + g.items.length, 0)
  const flaggedCount = groups.reduce((s, g) => s + g.items.filter(i => i.present).length, 0)
  const isScanning   = status === 'scanning'

  function handleScanAnother() {
    reset()
    navigate('/')
  }

  return {
    status, result, scanUrl, error,
    groups, parsedUrl, revealed,
    totalCount, flaggedCount, isScanning,
    handleScanAnother,
  }
}
