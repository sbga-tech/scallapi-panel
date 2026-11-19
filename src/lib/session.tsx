import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

import { createClient, normalizeBase, type Client, type Connection, type ServerInfo } from "@/lib/api"

const storageKey = "scallapi-panel.connection"

type StoredConnection = Connection & { remember: boolean }

type Session = {
  connection: Connection | null
  client: Client | null
  server: ServerInfo
  signIn: (connection: Connection, remember: boolean) => Promise<void>
  signOut: () => void
}

const SessionContext = createContext<Session | null>(null)

function readStored(): StoredConnection | null {
  const raw = localStorage.getItem(storageKey) ?? sessionStorage.getItem(storageKey)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredConnection
  } catch {
    localStorage.removeItem(storageKey)
    sessionStorage.removeItem(storageKey)
    return null
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<Connection | null>(() => readStored())
  const [server, setServer] = useState<ServerInfo>({ version: null, buildDate: null })

  const client = useMemo(() => (connection ? createClient(connection, setServer) : null), [connection])

  const session = useMemo<Session>(
    () => ({
      connection,
      client,
      server,
      async signIn(next, remember) {
        const normalized = { base: normalizeBase(next.base), key: next.key }
        await createClient(normalized, setServer).get("/config")
        const store = remember ? localStorage : sessionStorage
        localStorage.removeItem(storageKey)
        sessionStorage.removeItem(storageKey)
        store.setItem(storageKey, JSON.stringify({ ...normalized, remember }))
        setConnection(normalized)
      },
      signOut() {
        localStorage.removeItem(storageKey)
        sessionStorage.removeItem(storageKey)
        setConnection(null)
      },
    }),
    [connection, client, server]
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
