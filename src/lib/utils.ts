import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const AUD0 = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});
const AUD2 = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 2,
});

export function formatAUD(value: number, decimals: 0 | 2 = 0): string {
  if (!Number.isFinite(value)) return "—";
  return decimals === 0 ? AUD0.format(value) : AUD2.format(value);
}

export function formatFactor(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const pct = value * 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "\u2212" : "";
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

export function sanitiseFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-]+/g, "_").replace(/^_+|_+$/g, "") || "project";
}
