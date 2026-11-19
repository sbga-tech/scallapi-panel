import { z } from "zod"

export const managementPrefix = "/v8/management"

export type Connection = {
  base: string
  key: string
}

export type ServerInfo = {
  version: string | null
  buildDate: string | null
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string | undefined

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const ErrorEnvelope = z.object({
  error: z.union([z.string(), z.object({ code: z.string().optional(), message: z.string().optional() })]).optional(),
  message: z.string().optional(),
})

export function parseError(status: number, body: unknown, fallback: string) {
  if (typeof body === "string") return new ApiError(status, body.trim() || fallback)
  const parsed = ErrorEnvelope.safeParse(body)
  if (!parsed.success) return new ApiError(status, fallback)
  const { error, message } = parsed.data
  const code = typeof error === "string" ? error : error?.code
  const detail = message ?? (typeof error === "string" ? error : error?.message)
  return new ApiError(status, detail?.trim() || fallback, code?.trim() || undefined)
}

export function normalizeBase(base: string) {
  return base.trim().replace(/\/+$/, "").replace(/\/v[08]\/management$/, "")
}

export type Versioned<T> = { data: T; etag: string | null }

export type WriteOptions = { ifMatch?: string | null }

export interface Client {
  root: string
  get(path: string): Promise<unknown>
  read(path: string): Promise<Versioned<unknown>>
  post(path: string, body?: unknown): Promise<unknown>
  put(path: string, body?: unknown, options?: WriteOptions): Promise<unknown>
  patch(path: string, body?: unknown, options?: WriteOptions): Promise<unknown>
  del(path: string, body?: unknown, options?: WriteOptions): Promise<unknown>
  download(path: string): Promise<Blob>
}

export type ClientHooks = {
  onServerInfo?: (info: ServerInfo) => void
  onUnauthorized?: () => void
}

export function createClient(connection: Connection, hooks: ClientHooks = {}): Client {
  const root = `${normalizeBase(connection.base)}${managementPrefix}`

  async function readBody(response: Response): Promise<unknown> {
    return (response.headers.get("content-type") ?? "").includes("json") ? response.json() : response.text()
  }

  async function send(method: string, path: string, body?: unknown, options?: WriteOptions) {
    const headers = new Headers()
    headers.set("Authorization", `Bearer ${connection.key}`)
    if (options?.ifMatch) headers.set("If-Match", options.ifMatch)
    let payload: BodyInit | undefined
    if (body instanceof FormData || typeof body === "string") payload = body
    else if (body !== undefined) {
      headers.set("Content-Type", "application/json")
      payload = JSON.stringify(body)
    }
    const response = await fetch(`${root}${path}`, { method, headers, body: payload })
    hooks.onServerInfo?.({
      version: response.headers.get("x-cpa-version") ?? response.headers.get("x-server-version"),
      buildDate: response.headers.get("x-cpa-build-date") ?? response.headers.get("x-server-build-date"),
    })
    if (response.status === 401) hooks.onUnauthorized?.()
    if (!response.ok) throw parseError(response.status, await readBody(response), response.statusText)
    return response
  }

  async function request(method: string, path: string, body?: unknown, options?: WriteOptions): Promise<Versioned<unknown>> {
    const response = await send(method, path, body, options)
    return { data: await readBody(response), etag: response.headers.get("etag") }
  }

  return {
    root,
    get: async (path) => (await request("GET", path)).data,
    read: (path) => request("GET", path),
    post: async (path, body) => (await request("POST", path, body)).data,
    put: async (path, body, options) => (await request("PUT", path, body, options)).data,
    patch: async (path, body, options) => (await request("PATCH", path, body, options)).data,
    del: async (path, body, options) => (await request("DELETE", path, body, options)).data,
    download: async (path) => (await send("GET", path)).blob(),
  }
}
