import { describe, expect, it } from 'vitest';
import { resolveHomepageOpening } from './homepage/types';

describe('resolveHomepageOpening', () => {
    it("uses the admin's choice when there is one", () => {
        expect(resolveHomepageOpening('content-first', true)).toBe(
            'content-first',
        );
        expect(resolveHomepageOpening('ask-first', true)).toBe('ask-first');
    });

    it('opens on the composer by default when AI is usable', () => {
        expect(resolveHomepageOpening(null, true)).toBe('ask-first');
    });

    it('opens on content by default when AI is not usable', () => {
        expect(resolveHomepageOpening(null, false)).toBe('content-first');
    });

    it('never opens on a composer that cannot answer, even if asked to', () => {
        // A project can lose its agent after an admin chose ask-first.
        expect(resolveHomepageOpening('ask-first', false)).toBe(
            'content-first',
        );
    });
});
