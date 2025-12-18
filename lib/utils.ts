import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBR(dateYYYYMMDD: string) {
  const [y, m, d] = dateYYYYMMDD.split("-");
  return `${d}/${m}/${y}`;
}
