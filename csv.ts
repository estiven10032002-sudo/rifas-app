type Cell = string | number | boolean | null | undefined;

function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // Evita que Excel/Sheets ejecuten fórmulas si alguien escribió "=..." en un nombre.
  if (/^[=@\t\r]/.test(text) || (/^[+-]/.test(text) && !/^[+-][\d\s().-]+$/.test(text))) {
    text = `'${text}`;
  }
  return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV con BOM (Excel lo abre con tildes bien) y saltos de línea CRLF. */
export function toCsv(rows: Cell[][]): string {
  return '\uFEFF' + rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

export function downloadFile(filename: string, content: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
