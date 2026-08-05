/**
 * Empty in development — Vite proxies /api to Django.
 *
 * In production this is the API service's address. Render supplies it as a
 * bare `host:port` with no scheme, which `fetch` would treat as a relative
 * path, so normalise it to an absolute https:// origin and strip any trailing
 * slash (paths already start with one).
 */
/**
 * Deployed API origin, used when VITE_API_BASE_URL is absent at build time.
 *
 * Hardcoding a URL in source is not ideal, but this value has to be correct
 * inside the bundle and four separate deploys failed to get the env var there
 * — Render skipped builds, republished cached artifacts, and reported all of
 * it as success. An env var still wins when present; this only stops a
 * production build from silently shipping a frontend that cannot reach its
 * own API. Change it if the API service is renamed.
 */
const DEPLOYED_API_ORIGIN = 'https://wcc-api-5mhu.onrender.com'

function isLocalHost(): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)
}

/**
 * A hostname the browser can actually resolve.
 *
 * Render's `property: hostport` yields an INTERNAL address — "wcc-api-5mhu:10000"
 * — with no TLD, routable only inside Render's private network. A browser given
 * that fails with ERR_NAME_NOT_RESOLVED. Anything without a dot is therefore
 * unusable from a public page, `localhost` aside.
 */
function isPubliclyResolvable(hostname: string): boolean {
  return hostname === 'localhost' || hostname.includes('.')
}

function resolveBaseUrl(raw: string | undefined): string {
  const value = (raw ?? '').trim()
  if (value) {
    const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`
    try {
      if (isPubliclyResolvable(new URL(withScheme).hostname)) {
        return withScheme.replace(/\/+$/, '')
      }
    } catch {
      // Unparseable — treat it as absent rather than trusting it.
    }
  }
  // Empty is correct in dev — Vite proxies /api to Django on the same origin.
  return isLocalHost() ? '' : DEPLOYED_API_ORIGIN
}

const BASE_URL = resolveBaseUrl(import.meta.env.VITE_API_BASE_URL)

// Should be unreachable now that a production fallback exists, but keep the
// guard: an empty base URL outside dev means every request hits the SPA
// rewrite and returns index.html, so calls fail on JSON parse rather than as
// a network error and the app looks healthy while doing nothing.
if (!BASE_URL && !isLocalHost()) {
  console.error(
    '[Write Chap Chap] No API base URL resolved. Every API call will return ' +
      'the SPA index.html instead of JSON.',
  )
}

const ACCESS_KEY = 'wcc.access'
const REFRESH_KEY = 'wcc.refresh'

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY)
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY)
  },
  set(access: string, refresh?: string) {
    localStorage.setItem(ACCESS_KEY, access)
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

export class ApiError extends Error {
  status: number
  data: any

  constructor(status: number, data: any) {
    super(ApiError.messageFrom(data, status))
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }

  /** Turn DRF's varied error shapes into one readable sentence. */
  static messageFrom(data: any, status: number): string {
    if (!data) return `Request failed (${status})`
    if (typeof data === 'string') return data
    if (data.detail) return String(data.detail)
    if (Array.isArray(data)) return data.join(' ')
    const first = Object.entries(data)[0]
    if (first) {
      const [field, value] = first
      const text = Array.isArray(value) ? value.join(' ') : String(value)
      return field === 'non_field_errors' ? text : `${humanizeField(field)}: ${text}`
    }
    return `Request failed (${status})`
  }

  /** Per-field errors, for inline form display. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {}
    if (this.data && typeof this.data === 'object' && !Array.isArray(this.data)) {
      for (const [key, value] of Object.entries(this.data)) {
        if (key === 'detail') continue
        out[key] = Array.isArray(value) ? (value as string[]).join(' ') : String(value)
      }
    }
    return out
  }
}

function humanizeField(field: string) {
  return field.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

let refreshInFlight: Promise<boolean> | null = null

async function refreshAccessToken(): Promise<boolean> {
  if (!tokens.refresh) return false
  // Collapse concurrent 401s into a single refresh call.
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${BASE_URL}/api/auth/refresh/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh: tokens.refresh }),
        })
        if (!response.ok) return false
        const data = await response.json()
        tokens.set(data.access, data.refresh)
        return true
      } catch {
        return false
      } finally {
        refreshInFlight = null
      }
    })()
  }
  return refreshInFlight
}

interface RequestOptions {
  method?: string
  body?: any
  /** Send as multipart/form-data instead of JSON. */
  form?: FormData
  auth?: boolean
  signal?: AbortSignal
}

export async function request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, form, auth = true, signal } = options

  const send = async (retrying = false): Promise<T> => {
    const headers: Record<string, string> = {}
    if (!form) headers['Content-Type'] = 'application/json'
    if (auth && tokens.access) headers['Authorization'] = `Bearer ${tokens.access}`

    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal,
    })

    if (response.status === 401 && auth && !retrying && tokens.refresh) {
      const refreshed = await refreshAccessToken()
      if (refreshed) return send(true)
      tokens.clear()
      window.dispatchEvent(new CustomEvent('wcc:session-expired'))
    }

    if (response.status === 204) return undefined as T

    const text = await response.text()
    let data: any = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = text
      }
    }

    if (!response.ok) throw new ApiError(response.status, data)
    return data as T
  }

  return send()
}

export const api = {
  get: <T = any>(path: string, signal?: AbortSignal) => request<T>(path, { method: 'GET', signal }),
  post: <T = any>(path: string, body?: any) => request<T>(path, { method: 'POST', body }),
  patch: <T = any>(path: string, body?: any) => request<T>(path, { method: 'PATCH', body }),
  put: <T = any>(path: string, body?: any) => request<T>(path, { method: 'PUT', body }),
  del: <T = any>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T = any>(path: string, form: FormData, method = 'POST') =>
    request<T>(path, { method, form }),
  /** For public endpoints that must not send a stale Authorization header. */
  postPublic: <T = any>(path: string, body?: any) =>
    request<T>(path, { method: 'POST', body, auth: false }),
}

/** Absolute URL for a media path returned by the API. */
export function mediaUrl(path: string | null | undefined): string {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return `${BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}
