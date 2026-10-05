/**
 * Escapa una celda CSV. También neutraliza inyección de fórmulas en Excel
 * (celdas que empiezan con = + - @ o tabulador).
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "string" ? value : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvRow(values: unknown[]) {
  return values.map(csvCell).join(",");
}

/** BOM UTF-8 para que Excel detecte bien los acentos. */
export const CSV_BOM = "﻿";
