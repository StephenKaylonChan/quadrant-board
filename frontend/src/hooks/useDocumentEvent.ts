import { useEffect, useRef } from 'react'

export function useDocumentEvent<K extends keyof DocumentEventMap>(
  type: K,
  handler: (event: DocumentEventMap[K]) => void,
  enabled = true,
) {
  const handlerRef = useRef(handler)

  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    if (!enabled) return

    const listener = (event: DocumentEventMap[K]) => handlerRef.current(event)
    document.addEventListener(type, listener)
    return () => document.removeEventListener(type, listener)
  }, [type, enabled])
}
