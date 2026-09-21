import {
    describeInvalidOrganizationName,
    sanitizeOrganizationName,
    suggestOrganizationName,
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
        ['Ca\u1dc0fe Co', 'Cafe Co'],
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
            'Ca\u1dc0fe Co',
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

describe('describeInvalidOrganizationName', () => {
    const BODY = 'Use letters, numbers, spaces, hyphens or underscores.';

    it.each([
        ['Acme Inc.', "Periods aren't allowed"],
        ["Acme's Bakery", "Apostrophes aren't allowed"],
        ['Acme \u2019 Data', "Apostrophes aren't allowed"],
        ['Acme & Co', "Ampersands aren't allowed"],
        ['Acme, Data', "Commas aren't allowed"],
        ['Caf\u00e9 M\u00fcller', "Accented characters aren't allowed"],
        ['Acme & Co.', "That name has characters we can't use"],
        ['Acme \u{1f680}', "That name has characters we can't use"],
        ['', 'Enter an organization name'],
        ['   ', 'Enter an organization name'],
    ])('titles %j as %j', (input, title) => {
        expect(describeInvalidOrganizationName(input).title).toBe(title);
    });

    it.each(['Acme Inc.', 'Acme & Co.', '', 'Acme \u{1f680}'])(
        'states the rule once for %j',
        (input) => {
            expect(describeInvalidOrganizationName(input).body).toBe(BODY);
        },
    );

    it('never repeats the validator sentence', () => {
        const inputs = ['Acme Inc.', 'Acme & Co.', '', '...'];
        inputs.forEach((input) => {
            const { title, body } = describeInvalidOrganizationName(input);
            expect(`${title} ${body}`).not.toContain('not be empty');
            expect(`${title} ${body}`).not.toContain('can be composed only of');
        });
    });
});

describe('suggestOrganizationName', () => {
    it.each([
        ['Acme Inc.', 'Acme Inc'],
        ["Acme's Bakery", 'Acmes Bakery'],
        ['...', null],
        ['', null],
        ['Acme Inc', null],
        ['  Acme Inc  ', null],
    ])('suggests %j -> %j', (input, expected) => {
        expect(suggestOrganizationName(input)).toBe(expected);
    });
});
