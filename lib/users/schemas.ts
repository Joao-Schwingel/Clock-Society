import { z } from "zod";

// Contrato de /api/users (decisão 3.5, issue #13). Mensagens em PT-BR.

export const createUserSchema = z
  .object({
    full_name: z.string({ required_error: "Informe o nome." }).trim().min(1, "Informe o nome."),
    email: z.string({ required_error: "Informe o e-mail." }).trim().toLowerCase().email("E-mail inválido."),
    password: z
      .string({ required_error: "Informe a senha temporária." })
      .min(8, "A senha temporária precisa ter pelo menos 8 caracteres."),
    role: z.enum(["admin", "vendedor"], { errorMap: () => ({ message: "Papel inválido." }) }),
    salesperson_ids: z.array(z.string().min(1)).default([]),
    new_salesperson: z
      .object({
        name: z.string().trim().min(1, "Informe o nome do vendedor."),
        company_id: z.string().min(1, "Informe a empresa."),
      })
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (v.role === "vendedor" && v.salesperson_ids.length === 0 && !v.new_salesperson) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["salesperson_ids"],
        message: "Vincule o vendedor a pelo menos um registro.",
      });
    }
  });

export const updateUserSchema = z
  .object({
    full_name: z.string().trim().min(1, "Informe o nome.").optional(),
    is_active: z.boolean().optional(),
    reset_password: z.string().min(8, "A senha temporária precisa ter pelo menos 8 caracteres.").optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nada para alterar." });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// Primeira mensagem de cada campo, no formato { campo: mensagem }.
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    fields[key] ??= issue.message;
  }
  return fields;
}
