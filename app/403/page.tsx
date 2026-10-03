import { ShieldX } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SignOutButton } from "./sign-out-button"

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader className="items-center text-center">
            <ShieldX className="h-10 w-10 text-muted-foreground" />
            <CardTitle className="text-2xl">Acesso negado</CardTitle>
            <CardDescription>
              Seu usuário não tem permissão para acessar esta área. Se você acha que isso é um engano, fale com o
              administrador.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignOutButton />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
