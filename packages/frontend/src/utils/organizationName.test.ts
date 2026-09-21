import { validateOrganizationName } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { sanitizeDetectedOrganizationName } from './organizationName';

describe('sanitizeDetectedOrganizationName', () => {
    const FALLBACK = 'Lightdash';

    it.each([
        ['  Acme Analytics  ', 'Acme Analytics'],
        ['Acme Inc.', 'Acme Inc'],
        ["Acme's Bakery", 'Acmes Bakery'],
        ['Acme/Foo & Co.', 'Acme Foo Co'],
        ['Caf\u00e9 M\u00fcller', 'Cafe Muller'],
        ['...', FALLBACK],
        ['', FALLBACK],
    ])('turns %j into %j', (input, expected) => {
        expect(sanitizeDetectedOrganizationName(input, FALLBACK)).toBe(
            expected,
        );
    });

    it('never returns a name the validator rejects', () => {
        const inputs = [
            '  Acme Analytics  ',
            'Acme Inc.',
            "Acme's Bakery",
            'Acme/Foo & Co.',
            'Caf\u00e9 M\u00fcller',
            '...',
            '',
            '\u2019\u2019\u2019',
            'Acme \u2014 Data',
        ];
        inputs.forEach((input) => {
            expect(
                validateOrganizationName(
                    sanitizeDetectedOrganizationName(input, FALLBACK),
                ),
            ).toBe(true);
        });
    });
});
