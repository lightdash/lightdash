import {
    divideExact,
    exactNumber,
    formatExactNumber,
    matchesRoundedNumber,
    parseStatedNumber,
    scaleExact,
    subtractExact,
} from './exactNumbers';

describe('exact answer arithmetic', () => {
    it.each([
        ['0.1', '0.2', '-0.1'],
        ['9007199254740993', '9007199254740992', '1'],
        ['1e-3', '0.0009', '0.0001'],
    ])(
        'subtracts %s minus %s without floating point loss',
        (a, b, expected) => {
            expect(
                formatExactNumber(
                    subtractExact(exactNumber(a)!, exactNumber(b)!),
                ),
            ).toBe(expected);
        },
    );
    it.each([
        null,
        undefined,
        '',
        true,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        9007199254740992,
        '1e999',
        '123abc',
    ])('refuses nonnumeric or imprecise input %s', (input) => {
        expect(exactNumber(input)).toBeNull();
    });
    it('compares a rounded percentage using the displayed precision', () => {
        const actual = scaleExact(
            divideExact(exactNumber('10')!, exactNumber('90')!)!,
            100n,
        );
        const rounded = parseStatedNumber('11.11%')!;
        expect(
            matchesRoundedNumber(actual, rounded.value, rounded.precision),
        ).toBe(true);
        const wrong = parseStatedNumber('12%')!;
        expect(matchesRoundedNumber(actual, wrong.value, wrong.precision)).toBe(
            false,
        );
        expect(divideExact(exactNumber(1)!, exactNumber(0)!)).toBeNull();
    });
    it.each([
        ['1.25M', '1250000'],
        ['−12.5%', '-12.5'],
        ['9,007,199,254,740,993', '9007199254740993'],
        ['.5', '0.5'],
        ['0.05 million', '50000'],
    ])('parses %s as %s', (input, value) => {
        expect(formatExactNumber(parseStatedNumber(input)!.value)).toBe(value);
    });
    it('abstains on ambiguous unsupported separators', () => {
        expect(parseStatedNumber('12,5%')).toBeNull();
        expect(parseStatedNumber('12,')).toBeNull();
    });
    it.each([
        ['1.5', '1', false],
        ['1.5', '2', true],
        ['-1.5', '-1', false],
        ['-1.5', '-2', true],
    ])(
        'rounds halfway values consistently: %s to %s',
        (actual, stated, expected) => {
            const claim = parseStatedNumber(stated)!;
            expect(
                matchesRoundedNumber(
                    exactNumber(actual)!,
                    claim.value,
                    claim.precision,
                ),
            ).toBe(expected);
        },
    );
});
