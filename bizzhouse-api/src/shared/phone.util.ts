/**
 * WhatsApp user identifiers are E.164-style digit strings WITHOUT a '+'
 * (e.g. Indian numbers look like 919876543210). Gupshup/Meta reject sends
 * to anything else, so every outbound path must normalize user input
 * ("+91 98765 43210", "09876543210", "9876543210") into that form.
 */
export function normalizePhone(
  input: string,
  defaultCountryCode = '91',
): string {
  if (!input) return '';
  let digits = String(input).replace(/\D/g, '');

  // Strip leading trunk-access zero ("098765 43210" → "98765 43210")
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // 10-digit local number → prefix the default country code
  if (digits.length === 10) {
    digits = defaultCountryCode + digits;
  }

  return digits;
}

/** Count distinct {{N}} placeholders in a WhatsApp template body. */
export function countTemplateVariables(body: string): number {
  if (!body) return 0;
  const matches = body.match(/\{\{\d+\}\}/g) || [];
  return new Set(matches).size;
}

/** Build the Meta-format body component carrying positional variable values. */
export function buildBodyComponents(
  values: string[],
): Array<{ type: string; parameters: Array<{ type: string; text: string }> }> {
  if (!values?.length) return [];
  return [
    {
      type: 'body',
      parameters: values.map((v) => ({ type: 'text', text: String(v) })),
    },
  ];
}

/** Fill {{N}} placeholders with positional values for human-readable previews. */
export function fillTemplateBody(body: string, values: string[]): string {
  if (!body) return body;
  if (!values?.length) return body;
  let i = 0;
  return body.replace(/\{\{\d+\}\}/g, () => values[i++] ?? '');
}
