import { useCallback, useEffect, useRef, useState } from 'react'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/**
 * Fetch-on-mount with a manual `reload`. Deliberately small — the app's data
 * needs are per-screen, so a full query cache would be more machinery than
 * this earns.
 */
export function useAsync<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): AsyncState<T> & { reload: () => void; setData: (value: T) => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null })
  const mounted = useRef(true)
  const [nonce, setNonce] = useState(0)

  // Keep the latest fetcher without making it a dependency of the effect.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    let active = true
    setState((current) => ({ ...current, loading: true, error: null }))
    fetcherRef
      .current()
      .then((data) => {
        if (active && mounted.current) setState({ data, loading: false, error: null })
      })
      .catch((error: unknown) => {
        if (active && mounted.current) {
          setState({
            data: null,
            loading: false,
            error: error instanceof Error ? error.message : 'Something went wrong.',
          })
        }
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const setData = useCallback((value: T) => {
    setState((current) => ({ ...current, data: value }))
  }, [])

  return { ...state, reload, setData }
}

/** Debounce a rapidly-changing value (used by the live leak scanner). */
export function useDebounced<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}
