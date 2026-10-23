"use client"

import { createContext, useContext, type PropsWithChildren } from "react"
import type { AppSession } from "./session"

const SessionContext = createContext<AppSession | null>(null)

export function SessionProvider({ session, children }: PropsWithChildren<{ session: AppSession }>) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

export function useSession(): AppSession {
  const session = useContext(SessionContext)
  if (!session) throw new Error("useSession precisa estar dentro de <SessionProvider>")
  return session
}
