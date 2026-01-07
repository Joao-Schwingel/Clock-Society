import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

const MONTHS = [
  { label: "Janeiro", value: 0 },
  { label: "Fevereiro", value: 1 },
  { label: "Março", value: 2 },
  { label: "Abril", value: 3 },
  { label: "Maio", value: 4 },
  { label: "Junho", value: 5 },
  { label: "Julho", value: 6 },
  { label: "Agosto", value: 7 },
  { label: "Setembro", value: 8 },
  { label: "Outubro", value: 9 },
  { label: "Novembro", value: 10 },
  { label: "Dezembro", value: 11 },
];

const YEARS = [
  { label: "2020", value: "2020" },
  { label: "2021", value: "2021" },
  { label: "2022", value: "2022" },
  { label: "2023", value: "2023" },
  { label: "2024", value: "2024" },
  { label: "2025", value: "2025" },
  { label: "2026", value: "2026" },
  { label: "2027", value: "2027" },
  { label: "2028", value: "2028" },
  { label: "2029", value: "2029" },
  { label: "2030", value: "2030" },
];

type DashboardFiltersProps = {
  value: number[];
  yearValue: string;
  onChange: (value: number[]) => void;
  onYearChange: (value: string) => void;
};

export function DashboardFilters({
  value,
  yearValue,
  onChange,
  onYearChange,
}: DashboardFiltersProps) {
  const toggle = (month: number) => {
    onChange(
      value.includes(month)
        ? value.filter((m) => m !== month)
        : [...value, month]
    );
  };

const selectedMonths =
  value.length
    ? value
        .map(v => MONTHS.find(x => x.value === v)?.label)
        .join(", ")
    : "Selecionar meses";


  return (
    <div className="flex gap-6">
      <Popover>
        <PopoverTrigger asChild>
          <Button title={selectedMonths} variant="outline" className="w-3xs justify-between overflow-hidden">
            <span className="truncate">{selectedMonths}</span>
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[280px]">
          <div className="grid grid-cols-2 gap-2">
            {MONTHS.map((m) => (
              <label key={m.value} className="flex items-center gap-2">
                <Checkbox
                  checked={value.includes(m.value)}
                  onCheckedChange={() => toggle(m.value)}
                />
                <span>{m.label}</span>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <Select value={yearValue} onValueChange={onYearChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Selecione um ano" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Anos</SelectLabel>
            {YEARS.map((year) => (
              <SelectItem key={year.value} value={year.value}>{year.label}</SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
