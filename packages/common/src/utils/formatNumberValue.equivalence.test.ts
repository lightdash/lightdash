import { describe, expect, it } from 'vitest';
import {
    CustomFormatType,
    NumberSeparator,
    type CustomFormat,
} from '../types/field';
import { formatNumberValue } from './formatting';

function referenceGetFormatNumberOptions(value: number, format?: CustomFormat) {
    const hasCurrency =
        format?.type === CustomFormatType.CURRENCY && format?.currency;
    const currencyOptions: Intl.NumberFormatOptions = hasCurrency
        ? { style: 'currency', currency: format.currency }
        : {};

    const round = format?.round;

    if (round === undefined) {
        return hasCurrency ? currencyOptions : {};
    }

    if (round < 0) {
        return {
            maximumSignificantDigits: Math.max(
                Math.floor(value).toString().length + round,
                1,
            ),
            maximumFractionDigits: 0,
            ...currencyOptions,
        };
    }

    const fractionDigits = Math.min(round, 20);
    return {
        maximumFractionDigits: fractionDigits,
        minimumFractionDigits: fractionDigits,
        ...currencyOptions,
    };
}

function referenceFormatNumberValue(
    value: number,
    format?: CustomFormat,
): string {
    const options = referenceGetFormatNumberOptions(value, format);
    const separator = format?.separator || NumberSeparator.DEFAULT;
    switch (separator) {
        case NumberSeparator.COMMA_PERIOD:
            return value.toLocaleString('en-US', options);
        case NumberSeparator.SPACE_PERIOD:
            return value.toLocaleString('en-US', options).replace(/,/g, ' ');
        case NumberSeparator.PERIOD_COMMA:
            return value.toLocaleString('de-DE', options);
        case NumberSeparator.NO_SEPARATOR_PERIOD:
            return value.toLocaleString('en-US', {
                ...options,
                useGrouping: false,
            });
        case NumberSeparator.APOSTROPHE_PERIOD:
            return value.toLocaleString('en-US', options).replace(/,/g, "'");
        case NumberSeparator.DEFAULT:
            return value.toLocaleString(undefined, options);
        default:
            throw new Error(`Unknown separator ${separator}`);
    }
}

const outcome = (fn: () => string): string => {
    try {
        return `ok:${fn()}`;
    } catch (e) {
        return `throw:${e instanceof Error ? e.constructor.name : typeof e}`;
    }
};

const separators: Array<NumberSeparator | undefined> = [
    undefined,
    ...Object.values(NumberSeparator),
];

const currencies = [
    'USD',
    'EUR',
    'GBP',
    'JPY',
    'DKK',
    'BRL',
    'INR',
    'CHF',
    'KWD',
    'CLF',
    'usd',
];

const rounds: Array<number | undefined> = [
    undefined,
    0,
    1,
    2,
    3,
    1.5,
    20,
    25,
    -1,
    -2,
    -3,
    -6,
    -25,
];

const numberValues = [
    0,
    -0,
    1,
    -1,
    0.1,
    0.5,
    1.5,
    2.5,
    -2.5,
    9.995,
    99.5,
    999.9995,
    0.0005,
    0.000001234,
    1e-7,
    1 / 3,
    -1 / 3,
    123.456,
    -123.456,
    1234567.891,
    -1234567.891,
    987654321,
    -987654321,
    1e15,
    1e20,
    1e21,
    -1e21,
    1.25e25,
    Number.MAX_SAFE_INTEGER,
    -Number.MAX_SAFE_INTEGER,
    Number.MAX_VALUE,
    Number.MIN_VALUE,
    Number.EPSILON,
    NaN,
    Infinity,
    -Infinity,
];

const nonNumberValues = [
    '123',
    '1234567.891',
    ' 42 ',
    '1e3',
    '',
    BigInt(0),
    BigInt(1234567),
    BigInt(-98765),
    BigInt('123456789012345678901234567890'),
    new Date(Date.UTC(2024, 0, 15, 10, 30)),
    Object(5),
] as unknown as number[];

const formatsFor = (
    separator: NumberSeparator | undefined,
    currencyList: string[],
): Array<CustomFormat | undefined> => {
    const formats: Array<CustomFormat | undefined> = [];
    if (separator === undefined) formats.push(undefined);
    rounds.forEach((round) => {
        formats.push({ type: CustomFormatType.NUMBER, separator, round });
        formats.push({ type: CustomFormatType.PERCENT, separator, round });
        formats.push({ type: CustomFormatType.CURRENCY, separator, round });
        formats.push({
            type: CustomFormatType.NUMBER,
            separator,
            round,
            currency: 'USD',
        });
        currencyList.forEach((currency) => {
            formats.push({
                type: CustomFormatType.CURRENCY,
                separator,
                round,
                currency,
            });
        });
    });
    return formats;
};

const compareMatrix = (
    values: number[],
    currencyList: string[],
): { compared: number; mismatches: string[] } => {
    const mismatches: string[] = [];
    let compared = 0;
    separators.forEach((separator) => {
        formatsFor(separator, currencyList).forEach((format) => {
            values.forEach((value) => {
                const expected = outcome(() =>
                    referenceFormatNumberValue(value, format),
                );
                const actual = outcome(() => formatNumberValue(value, format));
                compared += 1;
                if (expected !== actual) {
                    mismatches.push(
                        `${String(value)} ${JSON.stringify(
                            format,
                        )}: expected ${expected}, got ${actual}`,
                    );
                }
            });
        });
    });
    return { compared, mismatches };
};

describe(
    'formatNumberValue equivalence with toLocaleString',
    { timeout: 120_000 },
    () => {
        it('matches the toLocaleString output for numbers', () => {
            const first = compareMatrix(numberValues, currencies);
            const warm = compareMatrix([...numberValues].reverse(), currencies);
            expect(first.compared).toBeGreaterThan(30000);
            expect([...first.mismatches, ...warm.mismatches]).toEqual([]);
        });

        it('matches the toLocaleString output for non-number inputs', () => {
            const { compared, mismatches } = compareMatrix(
                nonNumberValues,
                currencies,
            );
            expect(compared).toBeGreaterThan(9000);
            expect(mismatches).toEqual([]);
        });

        it('matches the toLocaleString output for every supported currency', () => {
            const allCurrencies = Intl.supportedValuesOf('currency');
            const { compared, mismatches } = compareMatrix(
                [0, -1.5, 1234567.891, -0.0005, 1e21, NaN],
                [...allCurrencies, 'XX', 'NOTACURRENCY'],
            );
            expect(allCurrencies.length).toBeGreaterThan(100);
            expect(compared).toBeGreaterThan(50000);
            expect(mismatches).toEqual([]);
        });
    },
);
