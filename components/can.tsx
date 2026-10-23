"use client"

import type { PropsWithChildren, ReactNode } from "react"
import { usePermissions } from "@/hooks/use-permissions"
import type { Permission } from "@/lib/auth/permissions"

type CanProps = PropsWithChildren<{
  permission: Permission
  fallback?: ReactNode
}>

// Guarda declarativa de UI. Esconder um botão não protege nada — a proteção real é o RLS.
export function Can({ permission, children, fallback = null }: CanProps) {
  const { can } = usePermissions()
  return <>{can(permission) ? children : fallback}</>
}
