import { describe, it, expect } from 'vitest';
import { splitTemplatePreview } from '../src/lib/template-preview';

describe('splitTemplatePreview', () => {
  it('marks filled values vs literal text', () => {
    const runs = splitTemplatePreview('Hi {{1}}, order {{2}} shipped', ['Rahul', '4471']);
    expect(runs).toEqual([
      { text: 'Hi ', filled: false, pending: false },
      { text: 'Rahul', filled: true, pending: false },
      { text: ', order ', filled: false, pending: false },
      { text: '4471', filled: true, pending: false },
      { text: ' shipped', filled: false, pending: false },
    ]);
  });

  it('keeps unfilled placeholders as pending runs', () => {
    const runs = splitTemplatePreview('Namaste {{1}}, code {{2}}', ['Priya', '']);
    expect(runs.filter((r) => r.pending).map((r) => r.text)).toEqual(['{{2}}']);
    expect(runs.filter((r) => r.filled).map((r) => r.text)).toEqual(['Priya']);
  });

  it('pads missing values as pending', () => {
    const runs = splitTemplatePreview('{{1}} and {{2}}', ['one']);
    expect(runs.map((r) => r.text)).toEqual(['one', ' and ', '{{2}}']);
  });

  it('handles bodies without placeholders', () => {
    expect(splitTemplatePreview('No vars here', [])).toEqual([
      { text: 'No vars here', filled: false, pending: false },
    ]);
  });

  it('trims whitespace-only values to pending', () => {
    const runs = splitTemplatePreview('Hi {{1}}!', ['   ']);
    expect(runs.some((r) => r.pending && r.text === '{{1}}')).toBe(true);
  });
});
