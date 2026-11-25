import { afterEach, describe, expect, it } from 'vitest';
import { cancelsHold, escapeIsForDesignMode, startsHold } from './holdKeys';

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

describe('escapeIsForDesignMode', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });
    const escapeOn = (html: string, selector: string): boolean => {
        document.body.innerHTML = html;
        const target = document.querySelector(selector)!;
        let mine = false;
        target.addEventListener('keydown', (event) => {
            mine = escapeIsForDesignMode(event as KeyboardEvent);
        });
        target.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );
        return mine;
    };

    it("is Design Mode's on the page, and not in a text box elsewhere", () => {
        expect(escapeOn('<main><p>chart</p></main>', 'p')).toBe(true);
        expect(escapeOn('<main><input /></main>', 'input')).toBe(false);
    });

    it("is Design Mode's in a bubble's empty reply box, so the bubble is let go", () => {
        expect(
            escapeOn(
                '<div data-bubble-id="b"><div contenteditable="true"><p></p></div></div>',
                '[contenteditable]',
            ),
        ).toBe(true);
        expect(
            escapeOn(
                '<div data-bubble-id="b"><textarea></textarea></div>',
                'textarea',
            ),
        ).toBe(true);
    });

    it('is left to a reply box that has words in it, so they are not lost', () => {
        expect(
            escapeOn(
                '<div data-bubble-id="b"><div contenteditable="true"><p>make it blue</p></div></div>',
                'p',
            ),
        ).toBe(false);
    });

    it('is left to a menu open in the bubble', () => {
        expect(
            escapeOn(
                '<div data-bubble-id="b"><ul role="listbox"><li>a</li></ul></div>',
                'li',
            ),
        ).toBe(false);
    });
});
