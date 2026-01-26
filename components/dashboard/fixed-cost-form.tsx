"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { DatePickerBR } from "./date-picker-br";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const fixedCostSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  category: z.enum(["Fixo", "Variável"], {
    required_error: "Categoria é obrigatória",
  }),
  months: z.number().min(1, "Mínimo 1 mês").max(12, "Máximo 12 meses"),
  monthlyValue: z.number().positive("Valor deve ser maior que zero"),
  startDate: z.string().min(1, "Data é obrigatória"),
  description: z.string().optional(),
});

export type FixedCostFormData = z.infer<typeof fixedCostSchema>;

interface FixedCostFormProps {
  companyId: string;
  userId: string;
  onFixedCostAdded: () => void;
}

export function FixedCostForm({
  companyId,
  userId,
  onFixedCostAdded,
}: FixedCostFormProps) {
  const { toast } = useToast();
  const supabase = createBrowserClient();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FixedCostFormData>({
    resolver: zodResolver(fixedCostSchema),
    defaultValues: {
      category: "Fixo",
      months: 1,
      description: "",
      startDate: "",
    },
  });

  const onSubmit = async (data: FixedCostFormData) => {
    const { error } = await supabase.from("fixed_costs").insert({
      company_id: companyId,
      user_id: userId,
      name: data.name,
      category: data.category,
      qtdmonths: data.months,
      monthly_value: data.monthlyValue,
      start_date: data.startDate,
      description: data.description || null,
    });

    if (error) {
      toast({
        title: "Erro",
        description: "Não foi possível adicionar o custo fixo.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Sucesso",
      description: "Custo fixo adicionado com sucesso!",
    });

    reset();
    onFixedCostAdded();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adicionar Custo</CardTitle>
        <CardDescription>
          Cadastre um novo custo fixo mensal para a empresa
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome do Custo *</Label>
              <Input
                placeholder="Ex: Salário João Silva"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-sm text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div className="flex gap-4">
              <div className="space-y-2">
                <Label>Categoria *</Label>
                <Controller
                  control={control}
                  name="category"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Fixo">Fixo</SelectItem>
                        <SelectItem value="Variável">Variável</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.category && (
                  <p className="text-sm text-destructive">
                    {errors.category.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Quantidade de Meses</Label>
                <Input
                  className="w-max"
                  max={12}
                  min={1}
                  type="number"
                  {...register("months", { valueAsNumber: true })}
                />
                {errors.months && (
                  <p className="text-sm text-destructive">
                    {errors.months.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Valor</Label>
              <Input
                type="number"
                step="0.01"
                {...register("monthlyValue", { valueAsNumber: true })}
              />
              {errors.monthlyValue && (
                <p className="text-sm text-destructive">
                  {errors.monthlyValue.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Data</Label>
              <Controller
                name="startDate"
                control={control}
                render={({ field }) => (
                  <DatePickerBR
                    id="startDate"
                    value={field.value}
                    onChange={field.onChange}
                    required
                  />
                )}
              />
              {errors.startDate && (
                <p className="text-sm text-destructive">
                  {errors.startDate.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea rows={3} {...register("description")} />
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Adicionando..." : "Adicionar Custo"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
