import { describe, expect, it } from 'vitest';
import { cancelsHold, holdToolForKey } from './holdKeys';

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('holdKeys', () => {
    it('Option starts the stylus, Control starts the cursor', () => {
        expect(holdToolForKey(key({ key: 'Alt', altKey: true }))).toBe(
            'stylus',
        );
        expect(holdToolForKey(key({ key: 'Control', ctrlKey: true }))).toBe(
            'cursor',
        );
        expect(holdToolForKey(key({ key: 'Shift', shiftKey: true }))).toBe(
            null,
        );
        expect(holdToolForKey(key({ key: 'a' }))).toBe(null);
    });

    it('Option with another key held does not start a hold', () => {
        expect(
            holdToolForKey(key({ key: 'Alt', altKey: true, shiftKey: true })),
        ).toBe(null);
        expect(
            holdToolForKey(key({ key: 'Alt', altKey: true, metaKey: true })),
        ).toBe(null);
        expect(
            holdToolForKey(
                key({ key: 'Control', ctrlKey: true, altKey: true }),
            ),
        ).toBe(null);
        expect(
            holdToolForKey(key({ key: 'Alt', altKey: true, repeat: true })),
        ).toBe(null);
    });

    it('a character key cancels the hold', () => {
        expect(cancelsHold(key({ key: 'e', altKey: true }))).toBe(true);
        expect(cancelsHold(key({ key: 'Dead', altKey: true }))).toBe(true);
        expect(cancelsHold(key({ key: 'Escape' }))).toBe(true);
        expect(cancelsHold(key({ key: 'Alt', altKey: true }))).toBe(false);
        expect(cancelsHold(key({ key: 'Shift', shiftKey: true }))).toBe(false);
    });
});
