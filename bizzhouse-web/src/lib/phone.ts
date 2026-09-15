/**
 * Pure phone/template helpers (client-side mirror of the API's shared
 * phone.util). The backend remains the source of truth — these exist for
 * display, validation and tests only.
 */

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

/** Fill {{N}} placeholders with positional values for previews. */
export function fillTemplateBody(body: string, values: string[]): string {
  if (!body || !values?.length) return body;
  let i = 0;
  return body.replace(/\{\{\d+\}\}/g, () => values[i++] ?? '');
}

/** Normalize user phone input to the E.164 digit form WhatsApp requires. */
export function normalizePhone(input: string, defaultCountryCode = '91'): string {
  if (!input) return '';
  let digits = String(input).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (digits.length === 10) {
    digits = defaultCountryCode + digits;
  }
  return digits;
}
