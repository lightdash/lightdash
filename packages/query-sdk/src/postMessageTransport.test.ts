import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequestId } from './postMessageTransport';

describe('createRequestId', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('uses crypto.randomUUID when available', () => {
        vi.stubGlobal('crypto', { randomUUID: () => 'uuid-from-crypto' });

        expect(createRequestId()).toBe('uuid-from-crypto');
    });

    // Apps served from a plain-http origin (self-hosted, headless capture) have
    // no secure context, so `crypto.randomUUID` is undefined there.
    it('falls back to a locally generated id when randomUUID is missing', () => {
        vi.stubGlobal('crypto', {});

        const first = createRequestId();
        const second = createRequestId();

        expect(first).toEqual(expect.any(String));
        expect(first.length).toBeGreaterThan(0);
        expect(second).not.toBe(first);
    });

    it('falls back when crypto itself is undefined', () => {
        vi.stubGlobal('crypto', undefined);

        expect(createRequestId()).toEqual(expect.any(String));
    });
});
