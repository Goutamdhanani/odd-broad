import { describe, it, expect } from 'vitest';
import { isEmbedLinkFresh } from './gupshup.service';

describe('isEmbedLinkFresh — spec §3.2 link-quota caching', () => {
  const now = Date.UTC(2026, 8, 15, 12);
  const day = 24 * 60 * 60 * 1000;

  it('false when no link was ever cached', () => {
    expect(isEmbedLinkFresh({ embedLink: null, embedLinkExpiresAt: null }, now)).toBe(false);
  });

  it('false when expiry is missing', () => {
    expect(isEmbedLinkFresh({ embedLink: 'https://x', embedLinkExpiresAt: null }, now)).toBe(false);
  });

  it('true while the link has more than the 5-minute safety margin left', () => {
    expect(
      isEmbedLinkFresh(
        { embedLink: 'https://x', embedLinkExpiresAt: new Date(now + 4 * day) },
        now,
      ),
    ).toBe(true);
  });

  it('false once inside the safety margin', () => {
    expect(
      isEmbedLinkFresh(
        { embedLink: 'https://x', embedLinkExpiresAt: new Date(now + 4 * 60 * 1000) },
        now,
      ),
    ).toBe(false);
  });

  it('false after the cached expiry has passed', () => {
    expect(
      isEmbedLinkFresh(
        { embedLink: 'https://x', embedLinkExpiresAt: new Date(now - day) },
        now,
      ),
    ).toBe(false);
  });
});
