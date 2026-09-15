import { describe, it, expect } from 'vitest';
import {
  normalizeButtonLabel,
  normalizeButton,
  normalizeMessageContent,
  fillTemplateBody,
} from '../src/lib/normalize';
import {
  countTemplateVariables,
  buildBodyComponents,
  fillTemplateBody as fillBodyServer,
  normalizePhone,
} from '../src/lib/phone';

/**
 * Regression tests for the React "Objects are not valid as a React child
 * (found: object with keys {text, type})" crash class: no normalization
 * output may ever be a raw object that could land in JSX as a child.
 */
describe('normalizeButtonLabel / normalizeButton', () => {
  it('accepts legacy string buttons', () => {
    expect(normalizeButtonLabel('Visit Store')).toBe('Visit Store');
    expect(normalizeButton('Visit Store')).toEqual({ label: 'Visit Store', type: 'QUICK_REPLY' });
  });

  it('accepts Gupshup object buttons and extracts text', () => {
    expect(normalizeButtonLabel({ type: 'QUICK_REPLY', text: 'Stop Promotions' })).toBe(
      'Stop Promotions',
    );
    expect(normalizeButton({ type: 'URL', text: 'Book A Demo', url: 'https://x.co' })).toEqual({
      label: 'Book A Demo',
      type: 'URL',
    });
  });

  it('never returns an object as label', () => {
    expect(typeof normalizeButtonLabel({ type: 'QUICK_REPLY', text: 'x' })).toBe('string');
    expect(normalizeButtonLabel(null)).toBe('');
    expect(normalizeButtonLabel(undefined)).toBe('');
    expect(normalizeButtonLabel({})).toBe('');
  });
});

describe('normalizeMessageContent', () => {
  it('renders plain text payloads', () => {
    const c = normalizeMessageContent({ body: 'Hello' }, 'text');
    expect(c).toEqual({ kind: 'text', text: 'Hello' });
    expect(typeof (c as { text?: string }).text).toBe('string');
  });

  it('handles the exact crash shape: a {text, type} object never becomes a child', () => {
    // Simulated provider fragment of any shape — the normalizer must return
    // a string, never the object itself.
    const weird = { text: 'Hello', type: 'text' };
    const c = normalizeMessageContent(weird, 'text');
    expect(c.kind).toBe('text');
    expect((c as { text: string }).text).toBe('Hello');
    expect(typeof (c as { text: string }).text).toBe('string');
  });

  it('renders template payloads with bodyText', () => {
    const c = normalizeMessageContent(
      { name: 'order_update', language: { code: 'en' }, bodyText: 'Hi Amit, order ORD-1 shipped.' },
      'template',
    );
    expect(c).toEqual({
      kind: 'template',
      templateName: 'order_update',
      body: 'Hi Amit, order ORD-1 shipped.',
      variables: undefined,
    });
  });

  it('renders template payloads from body components (legacy rows)', () => {
    const c = normalizeMessageContent(
      {
        name: 'smoke_var_test2',
        language: { code: 'en_US' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: 'Pooja' }, { type: 'text', text: 'ORD-992' }] },
        ],
      },
      'template',
    );
    expect(c.kind).toBe('template');
    expect((c as { variables?: string[] }).variables).toEqual(['Pooja', 'ORD-992']);
  });

  it('renders media payloads with link/caption', () => {
    const c = normalizeMessageContent(
      { image: { link: 'https://x/img.png', mime_type: 'image/png' }, caption: 'hi' },
      'image',
    );
    expect(c.kind).toBe('media');
    expect((c as { url?: string }).url).toBe('https://x/img.png');
    expect((c as { caption?: string }).caption).toBe('hi');
  });

  it('re-hosted internal media URLs are preserved', () => {
    const c = normalizeMessageContent(
      { mediaUrl: '/api/media/shops/s1/m1/media.png', mediaStored: true },
      'image',
    );
    expect((c as { url?: string }).url).toBe('/api/media/shops/s1/m1/media.png');
  });

  it('falls back to unsupported for malformed/unknown payloads — never raw objects', () => {
    const unknown = normalizeMessageContent({ something: { nested: true } }, 'unknown_type');
    expect(unknown.kind).toBe('unsupported');
    const empty = normalizeMessageContent(null, 'text');
    expect(empty.kind).toBe('unsupported');
    // Labels must be strings
    expect(typeof (unknown as { label: string }).label).toBe('string');
  });

  it('renders location payloads', () => {
    const c = normalizeMessageContent(
      { location: { latitude: 12.97, longitude: 77.59, address: 'MG Road' } },
      'location',
    );
    expect(c.kind).toBe('location');
  });
});

describe('fillTemplateBody', () => {
  it('fills positional variables', () => {
    expect(fillTemplateBody('Hi {{1}}, order {{2}} shipped', ['Amit', 'ORD-7'])).toBe(
      'Hi Amit, order ORD-7 shipped',
    );
    expect(fillBodyServer('Hi {{1}}!', ['Bob'])).toBe('Hi Bob!');
  });

  it('leaves placeholders intact when no values supplied', () => {
    expect(fillTemplateBody('Hi {{1}}', [])).toBe('Hi {{1}}');
  });
});

describe('phone normalization + meta components', () => {
  it('normalizes Indian numbers to E.164 digit form', () => {
    expect(normalizePhone('9876543210')).toBe('919876543210');
    expect(normalizePhone('098765 43210')).toBe('919876543210');
    expect(normalizePhone('+91 98765 43210')).toBe('919876543210');
    expect(normalizePhone('919876543210')).toBe('919876543210');
  });

  it('counts template variables and builds Meta body components', () => {
    expect(countTemplateVariables('Hi {{1}}, order {{2}} is ready!')).toBe(2);
    expect(
      buildBodyComponents(['A', 'B']),
    ).toEqual([
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'A' },
          { type: 'text', text: 'B' },
        ],
      },
    ]);
  });
});
