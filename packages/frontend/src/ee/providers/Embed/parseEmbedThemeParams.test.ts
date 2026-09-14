import { afterEach, describe, expect, it } from 'vitest';
import { parseEmbedThemeParams } from './parseEmbedThemeParams';

describe('iframe background colors', () => {
    afterEach(() => {
        window.history.replaceState(null, '', '/');
    });

    it.each([
        ['FFF', '#FFF'],
        ['abcd', '#abcd'],
        ['121212', '#121212'],
        ['FF000080', '#FF000080'],
        ['transparent', 'transparent'],
    ])('accepts backgroundColor=%s', (value, expected) => {
        window.history.replaceState(null, '', `/?backgroundColor=${value}`);

        expect(parseEmbedThemeParams().backgroundColor).toBe(expected);
    });

    it.each(['', 'red', 'rgb(0,0,0)', 'not-a-color', '12345', '1234567'])(
        'keeps the default background for %s',
        (value) => {
            window.history.replaceState(null, '', `/?backgroundColor=${value}`);

            expect(parseEmbedThemeParams().backgroundColor).toBeNull();
        },
    );
});
