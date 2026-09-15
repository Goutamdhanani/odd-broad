/**
 * Shared CSV serialization.
 *
 * escapeCsvValue neutralizes spreadsheet formula injection: user-controlled
 * text (contact names, descriptions) that starts with = + - @ tab or CR is
 * prefixed with an apostrophe so Excel/Sheets treat it as text instead of
 * executing `=cmd|'/C calc'!A0`-style payloads. Values are wrapped in quotes
 * with embedded quotes doubled.
 */
export function escapeCsvValue(value: string | null | undefined): string {
  let s = value ?? '';
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Assemble a CSV document from a plain header row and pre-formatted rows.
 * Numeric/boolean cells may be passed raw; every user-derived cell should go
 * through escapeCsvValue first. CRLF line endings per RFC 4180 (Excel-safe).
 */
export function toCsv(header: string[], rows: string[][]): string {
  const lines = rows.map((r) => r.join(','));
  return [header.join(','), ...lines].join('\r\n');
}
