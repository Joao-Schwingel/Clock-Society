"use client"

import { useSession } from "@/lib/auth/session-provider"
import { hasPermission, type Permission } from "@/lib/auth/permissions"

export function usePermissions() {
  const { permissions } = useSession()
  return {
    permissions,
    can: (permission: Permission) => hasPermission(permissions, permission),
  }
}
