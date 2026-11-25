import { describe, expect, it } from 'vitest';
import { cancelsHold, startsHold } from './holdKeys';

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('holdKeys', () => {
    it('Option starts a hold; Control and other keys do not', () => {
        expect(startsHold(key({ key: 'Alt', altKey: true }))).toBe(true);
        expect(startsHold(key({ key: 'Control', ctrlKey: true }))).toBe(false);
        expect(startsHold(key({ key: 'Shift', shiftKey: true }))).toBe(false);
        expect(startsHold(key({ key: 'a' }))).toBe(false);
    });

    it('Option with another key held does not start a hold', () => {
        expect(
            startsHold(key({ key: 'Alt', altKey: true, shiftKey: true })),
        ).toBe(false);
        expect(
            startsHold(key({ key: 'Alt', altKey: true, metaKey: true })),
        ).toBe(false);
        expect(
            startsHold(key({ key: 'Alt', altKey: true, repeat: true })),
        ).toBe(false);
    });

    it('AltGr does not start a hold', () => {
        // Windows and Linux keyboards report AltGr as Control plus Alt.
        expect(
            startsHold(key({ key: 'Alt', altKey: true, ctrlKey: true })),
        ).toBe(false);
        expect(
            startsHold(key({ key: 'Control', ctrlKey: true, altKey: true })),
        ).toBe(false);
        expect(
            startsHold(key({ key: 'AltGraph', altKey: true, ctrlKey: true })),
        ).toBe(false);
    });

    it('a character key cancels the hold', () => {
        expect(cancelsHold(key({ key: 'e', altKey: true }))).toBe(true);
        expect(cancelsHold(key({ key: 'Dead', altKey: true }))).toBe(true);
        expect(cancelsHold(key({ key: 'Escape' }))).toBe(true);
        expect(cancelsHold(key({ key: 'Alt', altKey: true }))).toBe(false);
        expect(cancelsHold(key({ key: 'Shift', shiftKey: true }))).toBe(false);
    });
});
