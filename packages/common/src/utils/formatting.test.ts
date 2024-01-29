import {
    Compact,
    CustomFormat,
    CustomFormatType,
    DimensionType,
    Format,
    MetricType,
    NumberSeparator,
} from '../types/field';
import {
    currencies,
    formatFieldValue,
    formatItemValue,
    formatTableCalculationNumber,
    formatTableCalculationValue,
    formatValue,
} from './formatting';
import { dimension, metric, tableCalculation } from './formatting.mock';

describe('Formatting', () => {
    describe('format and round', () => {
        test('formatValue should return the right format', async () => {
            const kilometerOptions = {
                format: Format.KM,
            };
            expect(formatValue(5, kilometerOptions)).toEqual('5 km');
            expect(formatValue('5', kilometerOptions)).toEqual('5 km');
            expect(
                formatValue(5, {
                    format: Format.MI,
                }),
            ).toEqual('5 mi');
            expect(formatValue(5, { format: Format.USD })).toEqual('$5.00');
            expect(formatValue(5, { format: Format.GBP })).toEqual('£5.00');
            expect(formatValue(5, { format: Format.EUR })).toEqual('€5.00');

            const percentageOptions = {
                format: Format.PERCENT,
            };
            expect(formatValue(5, percentageOptions)).toEqual('500%');
            expect(formatValue(0.05, percentageOptions)).toEqual('5%');
            expect(formatValue('5', percentageOptions)).toEqual('500%');
            expect(formatValue('foo', percentageOptions)).toEqual('foo');
            expect(formatValue(false, percentageOptions)).toEqual('false');
            expect(formatValue(1103)).toEqual('1,103');

            expect(formatValue(5)).toEqual('5');

            // Intl.NumberFormat rounds up after 3 decimals
            expect(formatValue(5.9)).toEqual('5.9');
            expect(formatValue(5.99)).toEqual('5.99');
            expect(formatValue(5.999)).toEqual('5.999');
            expect(formatValue(5.9999)).toEqual('6');
            expect(formatValue(5.99999)).toEqual('6');

            // ids are not comma separated
            expect(formatValue(1019, { format: Format.ID })).toEqual('1019');
        });
        test('formatValue should return the right round', async () => {
            const roundZeroOptions = {
                round: 0,
            };
            expect(formatValue(1, roundZeroOptions)).toEqual('1');
            expect(formatValue(10, roundZeroOptions)).toEqual('10');
            expect(formatValue(100, roundZeroOptions)).toEqual('100');
            expect(formatValue(1000, roundZeroOptions)).toEqual('1,000');
            expect(formatValue(10000, roundZeroOptions)).toEqual('10,000');
            expect(formatValue(100000, roundZeroOptions)).toEqual('100,000');
            expect(formatValue(1000000, roundZeroOptions)).toEqual('1,000,000');
            expect(formatValue(5, roundZeroOptions)).toEqual('5');
            expect(formatValue(5.001, roundZeroOptions)).toEqual('5');
            expect(formatValue(5.9999999, roundZeroOptions)).toEqual('6');

            const roundTwoOptions = {
                round: 2,
            };
            expect(formatValue(5, roundTwoOptions)).toEqual('5.00');
            expect(formatValue(5.001, roundTwoOptions)).toEqual('5.00');
            expect(formatValue(5.555, roundTwoOptions)).toEqual('5.56');
            expect(formatValue(5.5555, roundTwoOptions)).toEqual('5.56');
            expect(formatValue(5.9999999, roundTwoOptions)).toEqual('6.00');
            expect(formatValue('foo', roundTwoOptions)).toEqual('foo');
            expect(formatValue(false, roundTwoOptions)).toEqual('false');

            const roundTenOptions = {
                round: 10,
            };
            expect(formatValue(5, roundTenOptions)).toEqual('5.0000000000');
            expect(formatValue(5.001, roundTenOptions)).toEqual('5.0010000000');
            expect(formatValue(5.9999999, roundTenOptions)).toEqual(
                '5.9999999000',
            );

            // negative rounding not supported
            expect(
                formatValue(5, {
                    round: -1,
                }),
            ).toEqual('5');
        });

        test('formatValue should return the right format and round', async () => {
            expect(
                formatValue(5, {
                    format: Format.KM,
                    round: 2,
                }),
            ).toEqual('5.00 km');
            expect(
                formatValue(5, {
                    format: Format.KM,
                    round: -2,
                }),
            ).toEqual('5 km');
            expect(
                formatValue(5, {
                    format: Format.MI,
                    round: 4,
                }),
            ).toEqual('5.0000 mi');
            expect(
                formatValue(5, {
                    format: Format.MI,
                    round: -4,
                }),
            ).toEqual('5 mi');
            expect(
                formatValue(5, {
                    format: Format.USD,
                    round: 2,
                }),
            ).toEqual('$5.00');
            expect(
                formatValue(5.0, {
                    format: Format.USD,
                    round: 0,
                }),
            ).toEqual('$5');
            expect(
                formatValue(5, {
                    format: Format.USD,
                    round: -2,
                }),
            ).toEqual('$5.00');
            expect(
                formatValue(5.25, {
                    format: Format.USD,
                    round: -1,
                }),
            ).toEqual('$5.25');
            expect(
                formatValue('5.0000', {
                    format: Format.USD,
                    round: 2,
                }),
            ).toEqual('$5.00');
            expect(
                formatValue(5, {
                    format: Format.GBP,
                    round: 2,
                }),
            ).toEqual('£5.00');
            expect(
                formatValue(5, {
                    format: Format.GBP,
                    round: -2,
                }),
            ).toEqual('£5.00');
            expect(
                formatValue(5.25, {
                    format: Format.GBP,
                    round: -2,
                }),
            ).toEqual('£5.25');
            expect(
                formatValue(5, {
                    format: Format.EUR,
                    round: 2,
                }),
            ).toEqual('€5.00');
            expect(
                formatValue(5, {
                    format: Format.EUR,
                    round: -2,
                }),
            ).toEqual('€5.00');
            expect(
                formatValue(5.25, {
                    format: Format.EUR,
                    round: -2,
                }),
            ).toEqual('€5.25');
            expect(
                formatValue(5, {
                    format: Format.PERCENT,
                    round: 2,
                }),
            ).toEqual('500.00%');
            expect(
                formatValue(0.05, {
                    format: Format.PERCENT,
                    round: 2,
                }),
            ).toEqual('5.00%');
            expect(
                formatValue('5', {
                    format: Format.PERCENT,
                    round: 2,
                }),
            ).toEqual('500.00%');
            expect(
                formatValue(0.0511, {
                    format: Format.PERCENT,
                    round: 2,
                }),
            ).toEqual('5.11%');
            expect(
                formatValue(0.0511, {
                    format: Format.PERCENT,
                    round: 4,
                }),
            ).toEqual('5.1100%');
            expect(
                formatValue('foo', {
                    format: Format.PERCENT,
                    round: 2,
                }),
            ).toEqual('foo');
            expect(
                formatValue(false, {
                    format: Format.PERCENT,
                    round: 2,
                }),
            ).toEqual('false');
            expect(
                formatValue(0.05, {
                    format: Format.PERCENT,
                    round: -2,
                }),
            ).toEqual('5%');
            expect(
                formatValue('5', {
                    format: Format.PERCENT,
                    round: -2,
                }),
            ).toEqual('500%');
        });

        test('formatValue should return the right style', async () => {
            const T = Compact.THOUSANDS;
            const M = Compact.MILLIONS;
            const B = Compact.BILLIONS;
            expect(formatValue(5, { compact: T })).toEqual('0.01K');
            expect(formatValue(5, { compact: M })).toEqual('0.00M');
            expect(formatValue(500000, { compact: B })).toEqual('0.00B');
            expect(formatValue(5, { compact: B })).toEqual('0.00B');
            expect(formatValue(5, { compact: M, round: 2 })).toEqual('0.00M');

            expect(
                formatValue(5000, { compact: T, round: 2, format: Format.KM }),
            ).toEqual('5.00K km');
            expect(
                formatValue(50000, {
                    compact: T,
                    round: 4,
                    format: Format.MI,
                }),
            ).toEqual('50.0000K mi');
            expect(
                formatValue(5000, {
                    compact: T,
                    round: 2,
                    format: Format.USD,
                }),
            ).toEqual('$5.00K');
            expect(
                formatValue(5000000, {
                    compact: T,
                    round: 2,
                    format: Format.USD,
                }),
            ).toEqual('$5,000.00K');
            expect(
                formatValue(5000000, {
                    compact: M,
                    round: 2,
                    format: Format.USD,
                }),
            ).toEqual('$5.00M');

            expect(
                formatValue(4, {
                    compact: T,
                    round: 2,
                    format: Format.USD,
                }),
            ).toEqual('$0.00K');
            expect(
                formatValue(4, {
                    compact: T,
                    round: 3,
                    format: Format.USD,
                }),
            ).toEqual('$0.004K');

            expect(
                formatValue(5000000, {
                    compact: M,
                    round: 2,
                    format: Format.USD,
                }),
            ).toEqual('$5.00M');
            expect(
                formatValue(5000000000, {
                    compact: M,
                    round: 2,
                    format: Format.USD,
                }),
            ).toEqual('$5,000.00M');
            expect(
                formatValue(5000000000, {
                    compact: B,
                    round: 2,
                    format: Format.USD,
                }),
            ).toEqual('$5.00B');

            expect(
                formatValue(5000.0, {
                    compact: T,
                    round: 0,
                    format: Format.USD,
                }),
            ).toEqual('$5K');
            expect(
                formatValue('5000', {
                    compact: T,
                    round: 2,
                    format: Format.USD,
                }),
            ).toEqual('$5.00K');
            expect(
                formatValue(5000, {
                    compact: T,
                    round: 2,
                    format: Format.GBP,
                }),
            ).toEqual('£5.00K');
            expect(
                formatValue(5000, {
                    compact: T,
                    round: 2,
                    format: Format.EUR,
                }),
            ).toEqual('€5.00K');
            expect(
                formatValue(0.05, {
                    compact: T,
                    round: 2,
                    format: Format.PERCENT,
                }),
            ).toEqual('5.00%'); // No affects percent
        });
    });
    test('formatValue should support compact alias', () => {
        expect(formatValue(1000, { compact: 'K' })).toEqual('1.00K');
        expect(formatValue(1000, { compact: 'thousand' })).toEqual('1.00K');
        expect(formatValue(1000000, { compact: 'M' })).toEqual('1.00M');
        expect(formatValue(1000000, { compact: 'million' })).toEqual('1.00M');
        expect(formatValue(1000000000, { compact: 'B' })).toEqual('1.00B');
        expect(formatValue(1000000000, { compact: 'billion' })).toEqual(
            '1.00B',
        );
        expect(formatValue(1000000000000, { compact: 'T' })).toEqual('1.00T');
        expect(formatValue(1000000000000, { compact: 'trillion' })).toEqual(
            '1.00T',
        );
    });
    describe('format field value', () => {
        test('formatFieldValue should return the right format when field is undefined', async () => {
            expect(formatFieldValue(undefined, undefined)).toEqual('-');
            expect(formatFieldValue(undefined, null)).toEqual('∅');
            expect(formatFieldValue(undefined, '5')).toEqual('5');
            expect(formatFieldValue(undefined, 5)).toEqual('5');
        });

        test('formatFieldValue should return the right format when field is Dimension', async () => {
            expect(formatFieldValue(dimension, undefined)).toEqual('-');
            expect(formatFieldValue(dimension, null)).toEqual('∅');
            expect(
                formatFieldValue(
                    { ...dimension, type: DimensionType.STRING },
                    '5',
                ),
            ).toEqual('5');
            expect(
                formatFieldValue(
                    { ...dimension, type: DimensionType.NUMBER },
                    5,
                ),
            ).toEqual('5');
            expect(
                formatFieldValue(
                    { ...dimension, type: DimensionType.BOOLEAN },
                    true,
                ),
            ).toEqual('True');
            expect(
                formatFieldValue(
                    {
                        ...dimension,
                        type: DimensionType.DATE,
                    },
                    new Date('2021-03-10T00:00:00.000Z'),
                ),
            ).toEqual('2021-03-10');
            expect(
                formatFieldValue(
                    {
                        ...dimension,
                        type: DimensionType.TIMESTAMP,
                    },
                    new Date('2021-03-10T00:00:00.000Z'),
                ),
            ).toEqual('2021-03-10, 00:00:00:000 (+00:00)');
        });

        test('formatFieldValue should return the right format when field is Metric', async () => {
            expect(formatFieldValue(metric, undefined)).toEqual('-');
            expect(formatFieldValue(metric, null)).toEqual('∅');
            expect(
                formatFieldValue({ ...metric, type: MetricType.AVERAGE }, 5),
            ).toEqual('5');
            expect(
                formatFieldValue({ ...metric, type: MetricType.COUNT }, 5),
            ).toEqual('5');
            expect(
                formatFieldValue(
                    { ...metric, type: MetricType.COUNT_DISTINCT },
                    5,
                ),
            ).toEqual('5');
            expect(
                formatFieldValue({ ...metric, type: MetricType.SUM }, 5),
            ).toEqual('5');
            expect(
                formatFieldValue({ ...metric, type: MetricType.MIN }, 5000),
            ).toEqual('5,000');
            expect(
                formatFieldValue({ ...metric, type: MetricType.MAX }, 5000),
            ).toEqual('5,000');
            expect(
                formatFieldValue(
                    { ...metric, type: MetricType.MIN },
                    new Date('2021-03-10T00:00:00.000Z'),
                ),
            ).toEqual('2021-03-10, 00:00:00:000 (+00:00)');
            expect(
                formatFieldValue(
                    { ...metric, type: MetricType.MAX },
                    new Date('2021-03-10T00:00:00.000Z'),
                ),
            ).toEqual('2021-03-10, 00:00:00:000 (+00:00)');
        });
    });
    describe('format item value', () => {
        test('formatItemValue should return the right format when field is undefined', async () => {
            expect(formatItemValue(undefined, undefined)).toEqual('-');
            expect(formatItemValue(undefined, null)).toEqual('∅');
            expect(formatItemValue(undefined, '5')).toEqual('5');
            expect(formatItemValue(undefined, 5)).toEqual('5');
        });

        test('formatItemValue should return the right format when field is table calculation', async () => {
            expect(formatItemValue(tableCalculation, undefined)).toEqual('-');
            expect(formatItemValue(tableCalculation, null)).toEqual('∅');
            expect(formatItemValue(tableCalculation, '5')).toEqual('5');
            expect(formatItemValue(tableCalculation, 5)).toEqual('5');
        });
    });

    describe('format table calculation', () => {
        test('table calculation with default format', async () => {
            const defaultFormat = {
                ...tableCalculation,
                format: { type: CustomFormatType.DEFAULT },
            };
            expect(formatItemValue(defaultFormat, undefined)).toEqual('-');
            expect(formatItemValue(defaultFormat, null)).toEqual('∅');
            expect(formatItemValue(defaultFormat, '5')).toEqual('5');
            expect(formatItemValue(defaultFormat, 5)).toEqual('5');
        });
        test('table calculation with default format and extra arguments', async () => {
            // This round or separator should not affect default format
            const withExtraFormat = {
                ...tableCalculation,
                format: {
                    type: CustomFormatType.DEFAULT,
                    round: 2,
                    separator: NumberSeparator.COMMA_PERIOD,
                },
            };
            expect(formatItemValue(withExtraFormat, undefined)).toEqual('-');
            expect(formatItemValue(withExtraFormat, null)).toEqual('∅');
            expect(formatItemValue(withExtraFormat, '5')).toEqual('5');
            expect(formatItemValue(withExtraFormat, 5)).toEqual('5');
        });

        test('table calculation with percent format', async () => {
            const percentFormat = {
                ...tableCalculation,
                format: { type: CustomFormatType.PERCENT },
            };
            expect(formatItemValue(percentFormat, undefined)).toEqual('-');
            expect(formatItemValue(percentFormat, null)).toEqual('∅');
            expect(formatItemValue(percentFormat, '0.05')).toEqual('5%');
            expect(formatItemValue(percentFormat, 0.05)).toEqual('5%');
            expect(formatItemValue(percentFormat, 1)).toEqual('100%');
            expect(formatItemValue(percentFormat, 5)).toEqual('500%');
            expect(formatItemValue(percentFormat, '0.05123')).toEqual('5%');
        });
        test('table calculation with percent format and round', async () => {
            const percentFormat = {
                ...tableCalculation,
                format: { type: CustomFormatType.PERCENT, round: 1 },
            };
            expect(formatItemValue(percentFormat, undefined)).toEqual('-');
            expect(formatItemValue(percentFormat, null)).toEqual('∅');
            expect(formatItemValue(percentFormat, '0.05')).toEqual('5.0%');
            expect(formatItemValue(percentFormat, 0.05)).toEqual('5.0%');
            expect(formatItemValue(percentFormat, 1)).toEqual('100.0%');
            expect(formatItemValue(percentFormat, 5)).toEqual('500.0%');
            expect(formatItemValue(percentFormat, '0.05123')).toEqual('5.1%');
        });
        test('table calculation with percent format and number separator', async () => {
            const percentFormat = {
                ...tableCalculation,
                format: {
                    type: CustomFormatType.PERCENT,
                    round: 2,
                    separator: NumberSeparator.PERIOD_COMMA,
                },
            };
            expect(formatItemValue(percentFormat, undefined)).toEqual('-');
            expect(formatItemValue(percentFormat, null)).toEqual('∅');
            expect(formatItemValue(percentFormat, '0.05')).toEqual('5,00%');
            expect(formatItemValue(percentFormat, '0.05123')).toEqual('5,12%');
        });

        test('format number separator', async () => {
            const number = 123456789.12345;
            expect(
                formatTableCalculationNumber(number, {
                    type: CustomFormatType.DEFAULT,
                    round: 0,
                    separator: NumberSeparator.COMMA_PERIOD,
                }),
            ).toEqual('123,456,789');
            expect(
                formatTableCalculationNumber(number, {
                    type: CustomFormatType.DEFAULT,
                    round: 0,
                    separator: NumberSeparator.PERIOD_COMMA,
                }),
            ).toEqual('123.456.789');
            expect(
                formatTableCalculationNumber(number, {
                    type: CustomFormatType.DEFAULT,
                    round: 2,
                    separator: NumberSeparator.SPACE_PERIOD,
                }),
            ).toEqual('123 456 789.12');
            expect(
                formatTableCalculationNumber(number, {
                    type: CustomFormatType.DEFAULT,
                    round: 2,
                    separator: NumberSeparator.NO_SEPARATOR_PERIOD,
                }),
            ).toEqual('123456789.12');
        });

        test('format negative round', async () => {
            const number = 123456789.12345;
            expect(
                formatTableCalculationNumber(number, {
                    type: CustomFormatType.DEFAULT,
                    round: -1,
                    separator: NumberSeparator.COMMA_PERIOD,
                }),
            ).toEqual('123,456,790');
            expect(
                formatTableCalculationNumber(number, {
                    type: CustomFormatType.DEFAULT,
                    round: -2,
                    separator: NumberSeparator.PERIOD_COMMA,
                }),
            ).toEqual('123.456.800');
            expect(
                formatTableCalculationNumber(number, {
                    type: CustomFormatType.DEFAULT,
                    round: -3,
                    separator: NumberSeparator.SPACE_PERIOD,
                }),
            ).toEqual('123 457 000');
            expect(
                formatTableCalculationNumber(number, {
                    type: CustomFormatType.DEFAULT,
                    round: -99,
                    separator: NumberSeparator.NO_SEPARATOR_PERIOD,
                }),
            ).toEqual('100000000');
        });

        test('available currencies', async () => {
            const symbols = currencies.map((currency) => {
                const format = Intl.NumberFormat(undefined, {
                    style: 'currency',
                    currency,
                });
                return format.format(1).replace(' ', ' ');
            });
            expect(symbols).toEqual([
                '$1.00',
                '€1.00',
                '£1.00',
                '¥1',
                'CHF 1.00',
                'CA$1.00',
                'A$1.00',
                'CN¥1.00',
                'ARS 1.00',
                'R$1.00',
                'CLP 1',
                'COP 1.00',
                'CZK 1.00',
                'DKK 1.00',
                'HK$1.00',
                'HUF 1.00',
                '₹1.00',
                '₪1.00',
                '₩1',
                'MYR 1.00',
                'MX$1.00',
                'MAD 1.00',
                'NZ$1.00',
                'NOK 1.00',
                '₱1.00',
                'PLN 1.00',
                'RUB 1.00',
                'SAR 1.00',
                'SGD 1.00',
                'ZAR 1.00',
                'SEK 1.00',
                'NT$1.00',
                'THB 1.00',
                'TRY 1.00',
                '₫1',
            ]);
        });
        test('convert currencies with default settings', async () => {
            expect(
                currencies.slice(0, 4).map((currency) =>
                    formatTableCalculationValue(
                        {
                            ...tableCalculation,
                            format: {
                                type: CustomFormatType.CURRENCY,
                                currency,
                            },
                        },
                        12345.1235,
                    ),
                ),
            ).toEqual(['$12,345.12', '€12,345.12', '£12,345.12', '¥12,345']);

            // Number as string
            expect(
                currencies.slice(0, 4).map((currency) =>
                    formatTableCalculationValue(
                        {
                            ...tableCalculation,
                            format: {
                                type: CustomFormatType.CURRENCY,
                                currency,
                            },
                        },
                        '12345.1235',
                    ),
                ),
            ).toEqual(['$12,345.12', '€12,345.12', '£12,345.12', '¥12,345']);
        });
        test('convert currencies with round', async () => {
            expect(
                currencies.slice(0, 4).map((currency) =>
                    formatTableCalculationValue(
                        {
                            ...tableCalculation,
                            format: {
                                type: CustomFormatType.CURRENCY,
                                currency,
                                round: 3,
                            },
                        },
                        12345.1235,
                    ),
                ),
            ).toEqual([
                '$12,345.124',
                '€12,345.124',
                '£12,345.124',
                '¥12,345.124',
            ]);
        });
        test('convert currencies with separator ', async () => {
            // Using PERIOD_COMMA changes the position of the currency symbol
            expect(
                currencies.slice(0, 4).map((currency) =>
                    formatTableCalculationValue(
                        {
                            ...tableCalculation,
                            format: {
                                type: CustomFormatType.CURRENCY,
                                currency,
                                separator: NumberSeparator.PERIOD_COMMA,
                            },
                        },
                        12345.1235,
                    ),
                ),
            ).toEqual([
                '12.345,12 $',
                '12.345,12 €',
                '12.345,12 £',
                '12.345 ¥',
            ]);
        });
        test('convert currencies with compact ', async () => {
            expect(
                currencies.slice(0, 4).map((currency) =>
                    formatTableCalculationValue(
                        {
                            ...tableCalculation,
                            format: {
                                type: CustomFormatType.CURRENCY,
                                currency,
                                compact: Compact.THOUSANDS,
                            },
                        },
                        12345.1235,
                    ),
                ),
            ).toEqual(['$12.35K', '€12.35K', '£12.35K', '¥12K']);

            expect(
                currencies.slice(0, 4).map((currency) =>
                    formatTableCalculationValue(
                        {
                            ...tableCalculation,
                            format: {
                                type: CustomFormatType.CURRENCY,
                                currency,
                                compact: Compact.MILLIONS,
                                round: 0,
                            },
                        },
                        123456789.1235,
                    ),
                ),
            ).toEqual(['$123M', '€123M', '£123M', '¥123M']);
        });

        test('convert numbers ', async () => {
            expect(
                formatTableCalculationValue(
                    {
                        ...tableCalculation,
                        format: {
                            type: CustomFormatType.NUMBER,
                        },
                    },
                    12345.56789,
                ),
            ).toEqual('12,346');
            expect(
                formatTableCalculationValue(
                    {
                        ...tableCalculation,
                        format: {
                            type: CustomFormatType.NUMBER,
                            round: 2,
                            prefix: 'foo ',
                            suffix: ' bar',
                            compact: Compact.THOUSANDS,
                        },
                    },
                    12345.1235,
                ),
            ).toEqual('foo 12.35K bar');

            // Number as string
            expect(
                formatTableCalculationValue(
                    {
                        ...tableCalculation,
                        format: {
                            type: CustomFormatType.NUMBER,
                            prefix: 'foo ',
                            suffix: ' bar',
                        },
                    },
                    '12345.1235',
                ),
            ).toEqual('foo 12,345 bar');
        });
        test('convert table calculation formats with invalid numbers', async () => {
            const formatTableCalculation = (value: any, format: CustomFormat) =>
                formatTableCalculationValue(
                    {
                        ...tableCalculation,
                        format,
                    },
                    value,
                );
            // This method should return the original value if the value is not a number

            const values = [
                'this is a string',
                '',
                undefined,
                null,
                true,
                false,
            ];
            const expectedValue = [
                'this is a string',
                '',
                '-',
                '∅',
                'true',
                'false',
            ];
            values.map((value, i) =>
                expect(
                    formatTableCalculation(value, {
                        type: CustomFormatType.DEFAULT,
                    }),
                ).toEqual(expectedValue[i]),
            );

            values.map((value, i) =>
                expect(
                    formatTableCalculation(value, {
                        type: CustomFormatType.CURRENCY,
                        currency: Format.USD,
                    }),
                ).toEqual(expectedValue[i]),
            );
            values.map((value, i) =>
                expect(
                    formatTableCalculation(value, {
                        type: CustomFormatType.CURRENCY,
                        currency: Format.USD,
                        round: 2,
                        compact: Compact.THOUSANDS,
                        separator: NumberSeparator.PERIOD_COMMA,
                    }),
                ).toEqual(expectedValue[i]),
            );

            values.map((value, i) =>
                expect(
                    formatTableCalculation(value, {
                        type: CustomFormatType.NUMBER,
                    }),
                ).toEqual(expectedValue[i]),
            );
            values.map((value, i) =>
                expect(
                    formatTableCalculation(value, {
                        type: CustomFormatType.NUMBER,
                        prefix: 'foo',
                        suffix: 'bar',
                        round: 2,
                        compact: Compact.THOUSANDS,
                        separator: NumberSeparator.PERIOD_COMMA,
                    }),
                ).toEqual(expectedValue[i]),
            );

            values.map((value, i) =>
                expect(
                    formatTableCalculation(value, {
                        type: CustomFormatType.PERCENT,
                    }),
                ).toEqual(expectedValue[i]),
            );
            values.map((value, i) =>
                expect(
                    formatTableCalculation(value, {
                        type: CustomFormatType.PERCENT,
                        round: 2,
                        separator: NumberSeparator.PERIOD_COMMA,
                    }),
                ).toEqual(expectedValue[i]),
            );
        });
    });
});
