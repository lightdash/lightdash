import dayjs from 'dayjs';
import moment from 'moment';
import {
    Compact,
    CustomFormatType,
    DimensionType,
    Format,
    MetricType,
    NumberSeparator,
    type CustomFormat,
} from '../types/field';
import { TimeFrames } from '../types/timeFrames';
import {
    applyCustomFormat,
    currencies,
    formatItemValue,
    formatNumberValue,
    getCustomFormatFromLegacy,
    isMomentInput,
} from './formatting';
import {
    additionalMetric,
    dimension,
    metric,
    tableCalculation,
} from './formatting.mock';

describe('Formatting', () => {
    describe('convert legacy Format type', () => {
        [Format.KM, Format.MI].forEach((format) => {
            test(`when it is ${format.toUpperCase()} getCustomFormatFromLegacy should return the correct CustomFormat options`, () => {
                expect(getCustomFormatFromLegacy({ format })).toEqual({
                    type: CustomFormatType.NUMBER,
                    suffix: ` ${format}`,
                    compact: undefined,
                    round: undefined,
                });
            });
        });

        [Format.EUR, Format.GBP, Format.USD].forEach((format) => {
            test(`when it is ${format.toUpperCase()} getCustomFormatFromLegacy should return the correct CustomFormat options`, () => {
                expect(getCustomFormatFromLegacy({ format })).toEqual({
                    type: CustomFormatType.CURRENCY,
                    currency: format.toUpperCase(),
                    compact: undefined,
                    round: undefined,
                });
            });
        });

        test(`when it is ${Format.PERCENT.toUpperCase()} getCustomFormatFromLegacy should return the correct CustomFormat options`, () => {
            expect(
                getCustomFormatFromLegacy({ format: Format.PERCENT }),
            ).toEqual({
                type: CustomFormatType.PERCENT,
                compact: undefined,
                round: undefined,
            });
        });

        test(`when it is ${Format.ID.toUpperCase()} getCustomFormatFromLegacy should return the correct CustomFormat options`, () => {
            expect(getCustomFormatFromLegacy({ format: Format.ID })).toEqual({
                type: CustomFormatType.ID,
            });
        });
    });

    describe('applying CustomFormat to value', () => {
        describe('when using legacy format', () => {
            test('if Format is legacy distance unit it should return the right format', () => {
                expect(
                    applyCustomFormat(
                        5,
                        getCustomFormatFromLegacy({ format: Format.KM }),
                    ),
                ).toEqual('5 km');

                expect(
                    applyCustomFormat(
                        5,
                        getCustomFormatFromLegacy({
                            format: Format.MI,
                        }),
                    ),
                ).toEqual('5 mi');
            });

            test('if Format is currency unit it should return the right format', () => {
                expect(
                    applyCustomFormat(5, {
                        type: CustomFormatType.CURRENCY,
                        currency: Format.USD,
                    }),
                ).toEqual('$5.00');
                expect(
                    applyCustomFormat(5, {
                        type: CustomFormatType.CURRENCY,
                        currency: Format.GBP,
                    }),
                ).toEqual('£5.00');
                expect(
                    applyCustomFormat(5, {
                        type: CustomFormatType.CURRENCY,
                        currency: Format.EUR,
                    }),
                ).toEqual('€5.00');
            });

            test('if Format is percent it should return the right format', () => {
                const percentFormat: CustomFormat = {
                    type: CustomFormatType.PERCENT,
                };

                expect(applyCustomFormat(5, percentFormat)).toEqual('500%');
                expect(applyCustomFormat(0.05, percentFormat)).toEqual('5%');
                expect(applyCustomFormat('5', percentFormat)).toEqual('500%');
                expect(applyCustomFormat('foo', percentFormat)).toEqual('foo');
                expect(applyCustomFormat(false, percentFormat)).toEqual(
                    'false',
                );
            });

            test('if Format is undefined it should return the right format', () => {
                expect(applyCustomFormat(1103)).toEqual('1,103');
                expect(applyCustomFormat(5)).toEqual('5');
            });

            test('if Format is id it should return the right format', () => {
                // ids are not comma separated
                expect(
                    applyCustomFormat(1019, { type: CustomFormatType.ID }),
                ).toEqual('1019');
            });
        });

        describe('when applying round', () => {
            test('if round is undefined it should keep up to 3 decimal places', () => {
                expect(applyCustomFormat(5.9)).toEqual('5.9');
                expect(applyCustomFormat(5.99)).toEqual('5.99');
                expect(applyCustomFormat(5.999)).toEqual('5.999');
                expect(applyCustomFormat(5.9999)).toEqual('6');
                expect(applyCustomFormat(5.99999)).toEqual('6');
            });

            test('when round zero it should return the right round', () => {
                const roundZeroFormat: CustomFormat = {
                    type: CustomFormatType.NUMBER,
                    round: 0,
                };

                expect(applyCustomFormat(1, roundZeroFormat)).toEqual('1');
                expect(applyCustomFormat(10, roundZeroFormat)).toEqual('10');
                expect(applyCustomFormat(100, roundZeroFormat)).toEqual('100');
                expect(applyCustomFormat(5, roundZeroFormat)).toEqual('5');
                expect(applyCustomFormat(5.001, roundZeroFormat)).toEqual('5');
                expect(applyCustomFormat(0.001, roundZeroFormat)).toEqual('0');
                expect(applyCustomFormat(1000, roundZeroFormat)).toEqual(
                    '1,000',
                );
                expect(applyCustomFormat(10000, roundZeroFormat)).toEqual(
                    '10,000',
                );
                expect(applyCustomFormat(100000, roundZeroFormat)).toEqual(
                    '100,000',
                );
                expect(applyCustomFormat(1000000, roundZeroFormat)).toEqual(
                    '1,000,000',
                );
                expect(applyCustomFormat(5.9999999, roundZeroFormat)).toEqual(
                    '6',
                );
            });

            test('when round is positive number it should return the right round', () => {
                const roundTwoFormat: CustomFormat = {
                    type: CustomFormatType.NUMBER,
                    round: 2,
                };

                expect(applyCustomFormat(5, roundTwoFormat)).toEqual('5.00');
                expect(applyCustomFormat('foo', roundTwoFormat)).toEqual('foo');
                expect(applyCustomFormat(5.001, roundTwoFormat)).toEqual(
                    '5.00',
                );
                expect(applyCustomFormat(5.555, roundTwoFormat)).toEqual(
                    '5.56',
                );
                expect(applyCustomFormat(5.5555, roundTwoFormat)).toEqual(
                    '5.56',
                );
                expect(applyCustomFormat(5.9999999, roundTwoFormat)).toEqual(
                    '6.00',
                );
                expect(applyCustomFormat(false, roundTwoFormat)).toEqual(
                    'false',
                );

                const roundTenFormat: CustomFormat = {
                    type: CustomFormatType.NUMBER,
                    round: 10,
                };

                expect(applyCustomFormat(5, roundTenFormat)).toEqual(
                    '5.0000000000',
                );
                expect(applyCustomFormat(5.001, roundTenFormat)).toEqual(
                    '5.0010000000',
                );
                expect(applyCustomFormat(5.9999999, roundTenFormat)).toEqual(
                    '5.9999999000',
                );
            });

            test('when round is negative number it should return the right round', () => {
                const number = 123456789.12345;

                expect(
                    formatNumberValue(number, {
                        type: CustomFormatType.DEFAULT,
                        round: -1,
                    }),
                ).toEqual('123,456,790');
                expect(
                    formatNumberValue(number, {
                        type: CustomFormatType.DEFAULT,
                        round: -2,
                    }),
                ).toEqual('123,456,800');
                expect(
                    formatNumberValue(number, {
                        type: CustomFormatType.DEFAULT,
                        round: -3,
                    }),
                ).toEqual('123,457,000');
                expect(
                    formatNumberValue(number, {
                        type: CustomFormatType.DEFAULT,
                        round: -99,
                    }),
                ).toEqual('100,000,000');
            });
        });

        test('applyCustomFormat should return the right format and round', () => {
            expect(
                applyCustomFormat(5, {
                    type: CustomFormatType.NUMBER,
                    suffix: ` ${Format.KM}`,
                    round: 2,
                }),
            ).toEqual('5.00 km');
            expect(
                applyCustomFormat(5, {
                    type: CustomFormatType.NUMBER,
                    suffix: ` ${Format.KM}`,
                    round: -2,
                }),
            ).toEqual('5 km');
            expect(
                applyCustomFormat(5, {
                    type: CustomFormatType.NUMBER,
                    suffix: ` ${Format.MI}`,
                    round: 4,
                }),
            ).toEqual('5.0000 mi');
            expect(
                applyCustomFormat(5, {
                    type: CustomFormatType.NUMBER,
                    suffix: ` ${Format.MI}`,
                    round: -4,
                }),
            ).toEqual('5 mi');
            expect(
                applyCustomFormat(5, {
                    type: CustomFormatType.CURRENCY,
                    currency: Format.USD,
                    round: 2,
                }),
            ).toEqual('$5.00');
            expect(
                applyCustomFormat(5.0, {
                    type: CustomFormatType.CURRENCY,
                    currency: Format.USD,
                    round: 0,
                }),
            ).toEqual('$5');
            expect(
                applyCustomFormat(5, {
                    type: CustomFormatType.CURRENCY,
                    currency: Format.USD,
                    round: -2,
                }),
            ).toEqual('$5');
            expect(
                applyCustomFormat(5.25, {
                    type: CustomFormatType.CURRENCY,
                    currency: Format.USD,
                    round: -1,
                }),
            ).toEqual('$5');
            expect(
                applyCustomFormat('5.0000', {
                    type: CustomFormatType.CURRENCY,
                    currency: Format.USD,
                    round: 2,
                }),
            ).toEqual('$5.00');
            expect(
                applyCustomFormat(5, {
                    type: CustomFormatType.CURRENCY,
                    currency: Format.GBP,
                    round: 2,
                }),
            ).toEqual('£5.00');
            expect(
                applyCustomFormat(5, {
                    type: CustomFormatType.CURRENCY,
                    currency: Format.GBP,
                    round: -2,
                }),
            ).toEqual('£5');
            expect(
                applyCustomFormat(5.25, {
                    type: CustomFormatType.CURRENCY,
                    currency: Format.GBP,
                    round: -2,
                }),
            ).toEqual('£5');
            expect(
                applyCustomFormat(5, {
                    type: CustomFormatType.CURRENCY,
                    currency: Format.EUR,
                    round: 2,
                }),
            ).toEqual('€5.00');
            expect(
                applyCustomFormat(5, {
                    type: CustomFormatType.CURRENCY,
                    currency: Format.EUR,
                    round: -2,
                }),
            ).toEqual('€5');
            expect(
                applyCustomFormat(5.25, {
                    type: CustomFormatType.CURRENCY,
                    currency: Format.EUR,
                    round: -1,
                }),
            ).toEqual('€5');
            expect(
                applyCustomFormat(5, {
                    type: CustomFormatType.PERCENT,
                    round: 2,
                }),
            ).toEqual('500.00%');
            expect(
                applyCustomFormat(0.05, {
                    type: CustomFormatType.PERCENT,
                    round: 2,
                }),
            ).toEqual('5.00%');
            expect(
                applyCustomFormat('5', {
                    type: CustomFormatType.PERCENT,
                    round: 2,
                }),
            ).toEqual('500.00%');
            expect(
                applyCustomFormat(0.0511, {
                    type: CustomFormatType.PERCENT,
                    round: 2,
                }),
            ).toEqual('5.11%');
            expect(
                applyCustomFormat(0.0511, {
                    type: CustomFormatType.PERCENT,
                    round: 4,
                }),
            ).toEqual('5.1100%');
            expect(
                applyCustomFormat('foo', {
                    type: CustomFormatType.PERCENT,
                    round: 2,
                }),
            ).toEqual('foo');
            expect(
                applyCustomFormat(false, {
                    type: CustomFormatType.PERCENT,
                    round: 2,
                }),
            ).toEqual('false');
            expect(
                applyCustomFormat(0.05, {
                    type: CustomFormatType.PERCENT,
                    round: -2,
                }),
            ).toEqual('5%');
            expect(
                applyCustomFormat('5', {
                    type: CustomFormatType.PERCENT,
                    round: -2,
                }),
            ).toEqual('500%');
        });

        describe('when applying compact', () => {
            const K = Compact.THOUSANDS;
            const M = Compact.MILLIONS;
            const B = Compact.BILLIONS;
            const T = Compact.TRILLIONS;

            const thousandsConfig = {
                type: CustomFormatType.NUMBER,
                compact: K,
            };
            const millionsConfig = {
                type: CustomFormatType.NUMBER,
                compact: M,
            };
            const billionsConfig = {
                type: CustomFormatType.NUMBER,
                compact: B,
            };
            const trillionsConfig = {
                type: CustomFormatType.NUMBER,
                compact: T,
            };

            test('it should return the right style', () => {
                expect(applyCustomFormat(5, thousandsConfig)).toEqual('0.005K');
                expect(applyCustomFormat(5, millionsConfig)).toEqual('0M');
                expect(applyCustomFormat(500000, billionsConfig)).toEqual(
                    '0.001B',
                );
                expect(applyCustomFormat(5, billionsConfig)).toEqual('0B');
                expect(applyCustomFormat(5000000000, trillionsConfig)).toEqual(
                    '0.005T',
                );
            });

            test('when applying round it should return the right style', () => {
                expect(
                    applyCustomFormat(5, { ...millionsConfig, round: 2 }),
                ).toEqual('0.00M');
                expect(
                    applyCustomFormat(5400000, { ...millionsConfig, round: 0 }),
                ).toEqual('5M');
                expect(
                    applyCustomFormat(4956789123, {
                        ...trillionsConfig,
                        round: -1,
                    }),
                ).toEqual('0.005T');
            });

            test('with legacy distance format it should return the right format', () => {
                expect(
                    applyCustomFormat(
                        5000,
                        getCustomFormatFromLegacy({
                            compact: K,
                            round: 2,
                            format: Format.KM,
                        }),
                    ),
                ).toEqual('5.00K km');

                expect(
                    applyCustomFormat(
                        50000,
                        getCustomFormatFromLegacy({
                            compact: K,
                            round: 4,
                            format: Format.MI,
                        }),
                    ),
                ).toEqual('50.0000K mi');
            });

            test('with legacy currency format it should return the right format', () => {
                expect(
                    applyCustomFormat(
                        5000,
                        getCustomFormatFromLegacy({
                            compact: K,
                            round: 2,
                            format: Format.USD,
                        }),
                    ),
                ).toEqual('$5.00K');

                expect(
                    applyCustomFormat(
                        5000000,
                        getCustomFormatFromLegacy({
                            compact: K,
                            round: 2,
                            format: Format.USD,
                        }),
                    ),
                ).toEqual('$5,000.00K');

                expect(
                    applyCustomFormat(
                        5000000,
                        getCustomFormatFromLegacy({
                            compact: M,
                            round: 2,
                            format: Format.USD,
                        }),
                    ),
                ).toEqual('$5.00M');

                expect(
                    applyCustomFormat(
                        4,
                        getCustomFormatFromLegacy({
                            compact: K,
                            round: 2,
                            format: Format.USD,
                        }),
                    ),
                ).toEqual('$0.00K');

                expect(
                    applyCustomFormat(
                        4,
                        getCustomFormatFromLegacy({
                            compact: K,
                            round: 3,
                            format: Format.USD,
                        }),
                    ),
                ).toEqual('$0.004K');

                expect(
                    applyCustomFormat(
                        4000,
                        getCustomFormatFromLegacy({
                            compact: K,
                            format: Format.USD,
                        }),
                    ),
                ).toEqual('$4.00K');

                expect(
                    applyCustomFormat(
                        5000000,
                        getCustomFormatFromLegacy({
                            compact: M,
                            round: 2,
                            format: Format.USD,
                        }),
                    ),
                ).toEqual('$5.00M');

                expect(
                    applyCustomFormat(
                        5000000000,
                        getCustomFormatFromLegacy({
                            compact: M,
                            round: 2,
                            format: Format.USD,
                        }),
                    ),
                ).toEqual('$5,000.00M');

                expect(
                    applyCustomFormat(
                        5000000000,
                        getCustomFormatFromLegacy({
                            compact: B,
                            round: 2,
                            format: Format.USD,
                        }),
                    ),
                ).toEqual('$5.00B');

                expect(
                    applyCustomFormat(
                        5000.0,
                        getCustomFormatFromLegacy({
                            compact: K,
                            round: 0,
                            format: Format.USD,
                        }),
                    ),
                ).toEqual('$5K');

                expect(
                    applyCustomFormat(
                        '5000',
                        getCustomFormatFromLegacy({
                            compact: K,
                            round: 2,
                            format: Format.USD,
                        }),
                    ),
                ).toEqual('$5.00K');

                expect(
                    applyCustomFormat(
                        5000,
                        getCustomFormatFromLegacy({
                            compact: K,
                            round: 2,
                            format: Format.GBP,
                        }),
                    ),
                ).toEqual('£5.00K');

                expect(
                    applyCustomFormat(
                        5000,
                        getCustomFormatFromLegacy({
                            compact: K,
                            round: 2,
                            format: Format.EUR,
                        }),
                    ),
                ).toEqual('€5.00K');
            });

            test('with legacy percent format it should return the right format', () => {
                expect(
                    applyCustomFormat(
                        0.05,
                        getCustomFormatFromLegacy({
                            compact: K,
                            round: 2,
                            format: Format.PERCENT,
                        }),
                    ),
                ).toEqual('5.00%');
            });

            test('suports compact alias', () => {
                expect(
                    applyCustomFormat(1000, {
                        type: CustomFormatType.NUMBER,
                        compact: 'K',
                    }),
                ).toEqual('1K');

                expect(
                    applyCustomFormat(1000, {
                        type: CustomFormatType.NUMBER,
                        compact: 'thousand',
                    }),
                ).toEqual('1K');

                expect(
                    applyCustomFormat(1000000, {
                        type: CustomFormatType.NUMBER,
                        compact: 'M',
                    }),
                ).toEqual('1M');

                expect(
                    applyCustomFormat(1000000, {
                        type: CustomFormatType.NUMBER,
                        compact: 'million',
                    }),
                ).toEqual('1M');

                expect(
                    applyCustomFormat(1000000000, {
                        type: CustomFormatType.NUMBER,
                        compact: 'B',
                    }),
                ).toEqual('1B');

                expect(
                    applyCustomFormat(1000000000, {
                        type: CustomFormatType.NUMBER,
                        compact: 'billion',
                    }),
                ).toEqual('1B');

                expect(
                    applyCustomFormat(1000000000000, {
                        type: CustomFormatType.NUMBER,
                        compact: 'T',
                    }),
                ).toEqual('1T');

                expect(
                    applyCustomFormat(1000000000000, {
                        type: CustomFormatType.NUMBER,
                        compact: 'trillion',
                    }),
                ).toEqual('1T');
            });
        });
    });

    describe('formatItemValue', () => {
        test('formatItemValue should return the right format when field is undefined', () => {
            expect(formatItemValue(undefined, undefined)).toEqual('-');
            expect(formatItemValue(undefined, null)).toEqual('∅');
            expect(formatItemValue(undefined, '5')).toEqual('5');
            expect(formatItemValue(undefined, 5)).toEqual('5');
        });

        test('formatItemValue should return the right format when field is Dimension', () => {
            expect(formatItemValue(dimension, undefined)).toEqual('-');
            expect(formatItemValue(dimension, null)).toEqual('∅');
            expect(
                formatItemValue(
                    { ...dimension, type: DimensionType.STRING },
                    '5',
                ),
            ).toEqual('5');
            expect(
                formatItemValue(
                    { ...dimension, type: DimensionType.NUMBER },
                    5,
                ),
            ).toEqual('5');
            expect(
                formatItemValue(
                    { ...dimension, type: DimensionType.STRING },
                    132323123,
                ),
            ).toEqual('132323123');
            expect(
                formatItemValue(
                    { ...dimension, type: DimensionType.BOOLEAN },
                    true,
                ),
            ).toEqual('True');
            expect(
                formatItemValue(
                    {
                        ...dimension,
                        type: DimensionType.DATE,
                    },
                    new Date('2021-03-10T00:00:00.000Z'),
                ),
            ).toEqual('2021-03-10');
            expect(
                formatItemValue(
                    {
                        ...dimension,
                        type: DimensionType.TIMESTAMP,
                    },
                    new Date('2021-03-10T00:00:00.000Z'),
                ),
            ).toEqual('2021-03-10, 00:00:00:000 (+00:00)');
            expect(
                formatItemValue(
                    {
                        ...dimension,
                        timeInterval: TimeFrames.YEAR_NUM,
                        type: DimensionType.NUMBER,
                    },
                    2021,
                ),
            ).toEqual('2021');
        });

        test('formatItemValue should return the right format when field is Metric', () => {
            expect(formatItemValue(metric, undefined)).toEqual('-');
            expect(formatItemValue(metric, null)).toEqual('∅');
            expect(
                formatItemValue({ ...metric, type: MetricType.AVERAGE }, 5),
            ).toEqual('5');
            expect(
                formatItemValue({ ...metric, type: MetricType.COUNT }, 5),
            ).toEqual('5');
            expect(
                formatItemValue(
                    { ...metric, type: MetricType.COUNT_DISTINCT },
                    5,
                ),
            ).toEqual('5');
            expect(
                formatItemValue({ ...metric, type: MetricType.SUM }, 5),
            ).toEqual('5');
            expect(
                formatItemValue({ ...metric, type: MetricType.MIN }, 5000),
            ).toEqual('5,000');
            expect(
                formatItemValue({ ...metric, type: MetricType.MAX }, 5000),
            ).toEqual('5,000');
            expect(
                formatItemValue(
                    { ...metric, type: MetricType.MIN },
                    new Date('2021-03-10T00:00:00.000Z'),
                ),
            ).toEqual('2021-03-10, 00:00:00:000 (+00:00)');
            expect(
                formatItemValue(
                    { ...metric, type: MetricType.MAX },
                    new Date('2021-03-10T00:00:00.000Z'),
                ),
            ).toEqual('2021-03-10, 00:00:00:000 (+00:00)');
            expect(
                formatItemValue(
                    {
                        ...metric,
                        type: MetricType.NUMBER,
                        round: 2,
                    },
                    '1.123456123123',
                ),
            ).toEqual('1.12');
            expect(
                formatItemValue(
                    {
                        ...metric,
                        type: MetricType.NUMBER,
                        compact: Compact.THOUSANDS,
                    },
                    1000,
                ),
            ).toEqual('1K');
        });
    });
    describe('additional metric formatting', () => {
        test('format additional metric with custom format DATE', () => {
            expect(
                formatItemValue(
                    {
                        ...additionalMetric,
                        type: MetricType.MIN,
                        formatOptions: { type: CustomFormatType.DATE },
                    },
                    new Date('2021-03-10T00:00:00.000Z'),
                ),
            ).toEqual('2021-03-10');
            expect(
                formatItemValue(
                    {
                        ...additionalMetric,
                        type: MetricType.MAX,
                        formatOptions: {
                            type: CustomFormatType.DATE,
                            timeInterval: TimeFrames.DAY,
                        },
                    },
                    new Date('2021-03-10T00:00:00.000Z'),
                ),
            ).toEqual('2021-03-10');
            expect(
                formatItemValue(
                    {
                        ...additionalMetric,
                        type: MetricType.MIN,
                        formatOptions: {
                            type: CustomFormatType.DATE,
                            timeInterval: TimeFrames.YEAR,
                        },
                    },
                    new Date('2021-03-10T00:00:00.000Z'),
                ),
            ).toEqual('2021');
            expect(
                formatItemValue(
                    {
                        ...additionalMetric,
                        type: MetricType.MAX,
                        formatOptions: {
                            type: CustomFormatType.DATE,
                            timeInterval: TimeFrames.MONTH,
                        },
                    },
                    new Date('2021-03-10T00:00:00.000Z'),
                ),
            ).toEqual('2021-03');
        });

        test('format additional metric with custom format TIMESTAMP', () => {
            expect(
                formatItemValue(
                    {
                        ...additionalMetric,
                        type: MetricType.MIN,
                        formatOptions: { type: CustomFormatType.TIMESTAMP },
                    },
                    new Date('2021-03-10T00:00:00.000Z'),
                ),
            ).toEqual('2021-03-10, 00:00:00:000 (+00:00)');

            expect(
                formatItemValue(
                    {
                        ...additionalMetric,
                        type: MetricType.MAX,
                        formatOptions: {
                            type: CustomFormatType.TIMESTAMP,
                            timeInterval: TimeFrames.HOUR,
                        },
                    },
                    new Date('2021-03-10T00:00:00.000Z'),
                ),
            ).toEqual('2021-03-10, 00 (+00:00)');
            expect(
                formatItemValue(
                    {
                        ...additionalMetric,
                        type: MetricType.MIN,
                        formatOptions: {
                            type: CustomFormatType.TIMESTAMP,
                            timeInterval: TimeFrames.MINUTE,
                        },
                    },
                    new Date('2021-03-10T00:00:00.000Z'),
                ),
            ).toEqual('2021-03-10, 00:00 (+00:00)');
            expect(
                formatItemValue(
                    {
                        ...additionalMetric,
                        type: MetricType.MAX,
                        formatOptions: {
                            type: CustomFormatType.TIMESTAMP,
                            timeInterval: TimeFrames.SECOND,
                        },
                    },
                    new Date('2021-03-10T00:00:00.000Z'),
                ),
            ).toEqual('2021-03-10, 00:00:00 (+00:00)');
        });
    });

    describe('format item value', () => {
        test('formatItemValue should return the right format when field is undefined', () => {
            expect(formatItemValue(undefined, undefined)).toEqual('-');
            expect(formatItemValue(undefined, null)).toEqual('∅');
            expect(formatItemValue(undefined, '5')).toEqual('5');
            expect(formatItemValue(undefined, 5)).toEqual('5');
        });
        test('formatItemValue should return the right format when field is table calculation', () => {
            expect(formatItemValue(tableCalculation, undefined)).toEqual('-');
            expect(formatItemValue(tableCalculation, null)).toEqual('∅');
            expect(formatItemValue(tableCalculation, '5')).toEqual('5');
            expect(formatItemValue(tableCalculation, 5)).toEqual('5');
        });
    });

    describe('format table calculation', () => {
        test('table calculation with default format', () => {
            const defaultFormat = {
                ...tableCalculation,
                format: { type: CustomFormatType.DEFAULT },
            };
            expect(formatItemValue(defaultFormat, undefined)).toEqual('-');
            expect(formatItemValue(defaultFormat, null)).toEqual('∅');
            expect(formatItemValue(defaultFormat, '5')).toEqual('5');
            expect(formatItemValue(defaultFormat, 5)).toEqual('5');
        });
        test('table calculation with default format and extra arguments', () => {
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

        test('table calculation with percent format', () => {
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
            expect(formatItemValue(percentFormat, '0.05123')).toEqual('5.123%');
        });
        test('table calculation with percent format and round', () => {
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
        test('table calculation with percent format and number separator', () => {
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

        test('format number separator', () => {
            const number = 123456789.12345;
            expect(
                formatNumberValue(number, {
                    type: CustomFormatType.DEFAULT,
                    round: 0,
                    separator: NumberSeparator.COMMA_PERIOD,
                }),
            ).toEqual('123,456,789');
            expect(
                formatNumberValue(number, {
                    type: CustomFormatType.DEFAULT,
                    round: 0,
                    separator: NumberSeparator.PERIOD_COMMA,
                }),
            ).toEqual('123.456.789');
            expect(
                formatNumberValue(number, {
                    type: CustomFormatType.DEFAULT,
                    round: 2,
                    separator: NumberSeparator.SPACE_PERIOD,
                }),
            ).toEqual('123 456 789.12');
            expect(
                formatNumberValue(number, {
                    type: CustomFormatType.DEFAULT,
                    round: 2,
                    separator: NumberSeparator.NO_SEPARATOR_PERIOD,
                }),
            ).toEqual('123456789.12');
        });

        test('available currencies', () => {
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
        test('convert currencies with default settings', () => {
            expect(
                currencies.slice(0, 4).map((currency) =>
                    applyCustomFormat(12345.1235, {
                        type: CustomFormatType.CURRENCY,
                        currency,
                    }),
                ),
            ).toEqual(['$12,345.12', '€12,345.12', '£12,345.12', '¥12,345']);

            // Number as string
            expect(
                currencies.slice(0, 4).map((currency) =>
                    applyCustomFormat('12345.1235', {
                        type: CustomFormatType.CURRENCY,
                        currency,
                    }),
                ),
            ).toEqual(['$12,345.12', '€12,345.12', '£12,345.12', '¥12,345']);
        });
        test('convert currencies with round', () => {
            expect(
                currencies.slice(0, 4).map((currency) =>
                    applyCustomFormat(12345.1235, {
                        type: CustomFormatType.CURRENCY,
                        currency,
                        round: 3,
                    }),
                ),
            ).toEqual([
                '$12,345.124',
                '€12,345.124',
                '£12,345.124',
                '¥12,345.124',
            ]);
        });
        test('convert currencies with separator ', () => {
            // Using PERIOD_COMMA changes the position of the currency symbol
            expect(
                currencies.slice(0, 4).map((currency) =>
                    applyCustomFormat(12345.1235, {
                        type: CustomFormatType.CURRENCY,
                        currency,
                        separator: NumberSeparator.PERIOD_COMMA,
                    }),
                ),
            ).toEqual([
                '12.345,12 $',
                '12.345,12 €',
                '12.345,12 £',
                '12.345 ¥',
            ]);
        });
        test('convert currencies with compact ', () => {
            expect(
                currencies.slice(0, 4).map((currency) =>
                    applyCustomFormat(12345.1235, {
                        type: CustomFormatType.CURRENCY,
                        currency,
                        compact: Compact.THOUSANDS,
                    }),
                ),
            ).toEqual(['$12.35K', '€12.35K', '£12.35K', '¥12K']);

            expect(
                currencies.slice(0, 4).map((currency) =>
                    applyCustomFormat(123456789.1235, {
                        type: CustomFormatType.CURRENCY,
                        currency,
                        compact: Compact.MILLIONS,
                        round: 0,
                    }),
                ),
            ).toEqual(['$123M', '€123M', '£123M', '¥123M']);
        });

        test('convert numbers ', () => {
            expect(
                applyCustomFormat(12345.56789, {
                    type: CustomFormatType.NUMBER,
                }),
            ).toEqual('12,345.568');
            expect(
                applyCustomFormat(12345.1235, {
                    type: CustomFormatType.NUMBER,
                    round: 2,
                    prefix: 'foo ',
                    suffix: ' bar',
                    compact: Compact.THOUSANDS,
                }),
            ).toEqual('foo 12.35K bar');

            // Number as string
            expect(
                applyCustomFormat('12345.1235', {
                    type: CustomFormatType.NUMBER,
                    prefix: 'foo ',
                    suffix: ' bar',
                }),
            ).toEqual('foo 12,345.124 bar');
        });

        test('convert table calculation formats with invalid numbers', () => {
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
                    applyCustomFormat(value, {
                        type: CustomFormatType.DEFAULT,
                    }),
                ).toEqual(expectedValue[i]),
            );

            values.map((value, i) =>
                expect(
                    applyCustomFormat(value, {
                        type: CustomFormatType.CURRENCY,
                        currency: Format.USD,
                    }),
                ).toEqual(expectedValue[i]),
            );
            values.map((value, i) =>
                expect(
                    applyCustomFormat(value, {
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
                    applyCustomFormat(value, {
                        type: CustomFormatType.NUMBER,
                    }),
                ).toEqual(expectedValue[i]),
            );
            values.map((value, i) =>
                expect(
                    applyCustomFormat(value, {
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
                    applyCustomFormat(value, {
                        type: CustomFormatType.PERCENT,
                    }),
                ).toEqual(expectedValue[i]),
            );
            values.map((value, i) =>
                expect(
                    applyCustomFormat(value, {
                        type: CustomFormatType.PERCENT,
                        round: 2,
                        separator: NumberSeparator.PERIOD_COMMA,
                    }),
                ).toEqual(expectedValue[i]),
            );
        });
    });

    describe('isMomentInput', () => {
        test('should return true for moment object', () => {
            expect(isMomentInput(moment())).toBe(true);
        });

        test('should return true for dayjs object', () => {
            expect(isMomentInput(dayjs())).toBe(true);
        });

        test('should return true for dates', () => {
            expect(isMomentInput(new Date())).toBe(true);
        });

        test('should return true for strings', () => {
            expect(isMomentInput('2021-03-10')).toBe(true);
        });

        test('should return false for non-dates-strings-moment-dayjs types', () => {
            expect(isMomentInput(undefined)).toBe(false);
            expect(isMomentInput(null)).toBe(false);
        });
    });
});
