"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-rules"

// Troca de senha obrigatória (Fase 6, fatia 6.6). O middleware traz para cá qualquer rota enquanto
// o token tiver must_change_password (V-MW-02).
export default function ChangePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrors({})
    try {
      const res = await fetch("/api/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirm }),
      })
      const body = await res.json()
      if (!res.ok) {
        setErrors(body.fields ?? { form: body.error ?? "Não foi possível trocar a senha." })
        return
      }
      router.replace(body.redirectTo)
      router.refresh()
    } catch {
      setErrors({ form: "Não foi possível trocar a senha. Tente novamente." })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignOut = async () => {
    await createClient().auth.signOut()
    router.replace("/auth/login")
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <KeyRound className="h-8 w-8 text-muted-foreground" />
            <CardTitle className="text-2xl">Troque sua senha</CardTitle>
            <CardDescription>
              Você entrou com uma senha temporária. Defina uma senha nova para continuar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="new-password">Nova senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Pelo menos {MIN_PASSWORD_LENGTH} caracteres.</p>
                {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
                {errors.confirm && <p className="text-sm text-destructive">{errors.confirm}</p>}
              </div>
              {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Salvando..." : "Trocar senha"}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={handleSignOut}>
                Sair
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
