import {
    sanitizeOrganizationName,
    validateOrganizationName,
} from './organization';

describe('sanitizeOrganizationName', () => {
    const FALLBACK = 'Lightdash';

    it.each([
        ['  Acme Analytics  ', 'Acme Analytics'],
        ['Acme Inc.', 'Acme Inc'],
        ["Acme's Bakery", 'Acmes Bakery'],
        ['Acme/Foo & Co.', 'Acme Foo Co'],
        ['Café Müller', 'Cafe Muller'],
        ['...', FALLBACK],
        ['', FALLBACK],
    ])('turns %j into %j', (input, expected) => {
        expect(sanitizeOrganizationName(input, FALLBACK)).toBe(expected);
    });

    it('never returns a name the validator rejects', () => {
        const inputs = [
            '  Acme Analytics  ',
            'Acme Inc.',
            "Acme's Bakery",
            'Acme/Foo & Co.',
            'Café Müller',
            '...',
            '',
            '’’’',
            'Acme — Data',
        ];
        inputs.forEach((input) => {
            expect(
                validateOrganizationName(
                    sanitizeOrganizationName(input, FALLBACK),
                ),
            ).toBe(true);
        });
    });
});
