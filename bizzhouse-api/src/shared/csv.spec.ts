import { describe, it, expect } from 'vitest';
import { escapeCsvValue, toCsv } from './csv';

describe('escapeCsvValue', () => {
  it('quotes values and doubles embedded quotes', () => {
    expect(escapeCsvValue('Priya "Boutique"')).toBe('"Priya ""Boutique"""');
  });

  it('neutralizes formula-leading characters', () => {
    expect(escapeCsvValue('=cmd|calc')).toBe('"\'=cmd|calc"');
    expect(escapeCsvValue('+1x')).toBe('"\'+1x"');
    expect(escapeCsvValue('-1x')).toBe('"\'-1x"');
    expect(escapeCsvValue('@SUM')).toBe('"\'@SUM"');
  });

  it('leaves normal text unescaped-apart from quoting', () => {
    expect(escapeCsvValue('hello world')).toBe('"hello world"');
  });

  it('handles null/undefined', () => {
    expect(escapeCsvValue(null)).toBe('""');
    expect(escapeCsvValue(undefined)).toBe('""');
  });

  it('does NOT prefix phone numbers (leading digit is safe)', () => {
    expect(escapeCsvValue('919876543210')).toBe('"919876543210"');
  });
});

describe('toCsv', () => {
  it('joins plain header + pre-escaped rows with CRLF', () => {
    const csv = toCsv(
      ['a', 'b'],
      [
        ['1', '"x"'],
        ['2', '"y,z"'],
      ],
    );
    expect(csv).toBe('a,b\r\n1,"x"\r\n2,"y,z"');
  });

  it('header-only when no rows', () => {
    expect(toCsv(['x', 'y'], [])).toBe('x,y');
  });
});
