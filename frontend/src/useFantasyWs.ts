import { useEffect, useRef, useState } from 'react'

const wsUrl = () => {
  const base = import.meta.env.VITE_WS_BASE?.trim()
  if (base) return base
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
}

export function useFantasyWs(enabled: boolean) {
  const [last, setLast] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const ref = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!enabled) {
      setConnected(false)
      return
    }
    const ws = new WebSocket(wsUrl())
    ref.current = ws
    ws.onopen = () => setConnected(true)
    ws.onmessage = (ev) => setLast(String(ev.data))
    ws.onclose = () => setConnected(false)
    ws.onerror = () => { /* dev */ }
    return () => {
      ws.close()
      ref.current = null
    }
  }, [enabled])

  return { last, connected }
}
