import { ShieldX } from "lucide-react"

// Mostrado no lugar de uma aba que o papel não pode ver (?tab=/?company= forçado na URL, N11).
export function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center" role="alert">
      <ShieldX className="h-10 w-10 text-muted-foreground" />
      <p className="text-lg font-semibold">Acesso negado</p>
      <p className="text-sm text-muted-foreground">Você não tem permissão para ver esta área.</p>
    </div>
  )
}
