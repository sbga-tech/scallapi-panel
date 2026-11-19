import { useQueryClient } from "@tanstack/react-query"
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { z } from "zod"

import { createClient, normalizeBase, type Client, type Connection, type ServerInfo } from "@/lib/api"

const storageKey = "scallapi-panel.connection"

const StoredConnection = z.object({ base: z.string(), key: z.string(), remember: z.boolean() })

type Session = {
  connection: Connection | null
  client: Client | null
  server: ServerInfo
  signIn: (connection: Connection, remember: boolean) => Promise<void>
  signOut: () => void
}

const SessionContext = createContext<Session | null>(null)

function readStored(): Connection | null {
  const raw = localStorage.getItem(storageKey) ?? sessionStorage.getItem(storageKey)
  if (!raw) return null
  try {
    return StoredConnection.parse(JSON.parse(raw))
  } catch {
    localStorage.removeItem(storageKey)
    sessionStorage.removeItem(storageKey)
    return null
  }
}

function forget() {
  localStorage.removeItem(storageKey)
  sessionStorage.removeItem(storageKey)
}

const active: { connection: Connection | null } = { connection: null }

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [initial] = useState(() => {
    active.connection = readStored()
    return active.connection
  })
  const [connection, setConnection] = useState<Connection | null>(initial)
  const [server, setServerState] = useState<ServerInfo>({ version: null, buildDate: null })
  const setServer = useCallback(
    (next: ServerInfo) =>
      setServerState((value) => (value.version === next.version && value.buildDate === next.buildDate ? value : next)),
    []
  )

  const switchTo = useCallback(
    (next: Connection | null) => {
      active.connection = next
      queryClient.clear()
      setConnection(next)
    },
    [queryClient]
  )

  const signOut = useCallback(() => {
    forget()
    switchTo(null)
  }, [switchTo])

  const client = useMemo(
    () =>
      connection
        ? createClient(connection, { onServerInfo: setServer, onUnauthorized: signOut, isCurrent: () => active.connection === connection })
        : null,
    [connection, setServer, signOut]
  )

  const session = useMemo<Session>(
    () => ({
      connection,
      client,
      server,
      async signIn(next, remember) {
        const normalized = { base: normalizeBase(next.base), key: next.key }
        await createClient(normalized, { onServerInfo: setServer }).get("/config")
        forget()
        ;(remember ? localStorage : sessionStorage).setItem(storageKey, JSON.stringify({ ...normalized, remember }))
        switchTo(normalized)
      },
      signOut,
    }),
    [connection, client, server, setServer, switchTo, signOut]
  )

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

export function useSession() {
  const session = useContext(SessionContext)
  if (!session) throw new Error("useSession must be used inside SessionProvider")
  return session
}

export function useClient() {
  const { client } = useSession()
  if (!client) throw new Error("useClient requires a signed-in session")
  return client
}
