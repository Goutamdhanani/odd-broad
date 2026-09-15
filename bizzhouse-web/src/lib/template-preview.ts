/**
 * Pure split of a WhatsApp template body into text runs marked by whether
 * their {{N}} placeholder has been filled yet — lets previews highlight
 * entered values and dim pending placeholders without a markdown/risk of
 * dangerouslySetInnerHTML.
 *
 * Values fill in occurrence order ({{1}}, {{2}}, … as they appear), matching
 * the provider's positional semantics (see backend fillTemplateBody).
 */
export interface TemplatePreviewRun {
  text: string;
  /** true when this run is a substituted value, false for literal text */
  filled: boolean;
  /** true when this run is an UNFILLED placeholder still showing {{N}} */
  pending: boolean;
}

export function splitTemplatePreview(
  body: string,
  values: string[],
): TemplatePreviewRun[] {
  const runs: TemplatePreviewRun[] = [];
  const re = /\{\{\d+\}\}/g;
  let last = 0;
  let valueIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    if (match.index > last) {
      runs.push({ text: body.slice(last, match.index), filled: false, pending: false });
    }
    const value = (values[valueIndex++] ?? '').trim();
    if (value) {
      runs.push({ text: value, filled: true, pending: false });
    } else {
      runs.push({ text: match[0], filled: false, pending: true });
    }
    last = re.lastIndex;
  }
  if (last < body.length) {
    runs.push({ text: body.slice(last), filled: false, pending: false });
  }
  return runs;
}
