"use client"

import { LogOut } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

export function SignOutButton() {
  const router = useRouter()

  const handleSignOut = async () => {
    await createClient().auth.signOut()
    router.replace("/auth/login")
  }

  return (
    <Button className="w-full" variant="outline" onClick={handleSignOut}>
      <LogOut className="h-4 w-4 mr-2" />
      Sair
    </Button>
  )
}
