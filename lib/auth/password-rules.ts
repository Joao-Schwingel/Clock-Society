// Regras mínimas da troca de senha obrigatória (Fase 6, fatia 6.6; V-UI-08). Mensagens em PT-BR.

export const MIN_PASSWORD_LENGTH = 8;

export function validatePasswordChange({
  password,
  confirm,
}: {
  password: string;
  confirm: string;
}): Record<string, string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { password: `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }
  if (password !== confirm) return { confirm: "As senhas não conferem." };
  return {};
}

// Erros do Supabase Auth ao trocar a senha (`error.code`), em PT-BR. "same_password" é a nova senha
// igual à atual — que, na troca obrigatória, é a temporária.
export function authPasswordErrorMessage(code: string | undefined): string {
  switch (code) {
    case "same_password":
      return "A nova senha precisa ser diferente da senha temporária.";
    case "weak_password":
      return "Senha fraca. Use uma senha mais longa e menos previsível.";
    default:
      return "Não foi possível trocar a senha. Tente novamente.";
  }
}
