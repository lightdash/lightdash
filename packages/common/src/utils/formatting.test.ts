import { Compact, DimensionType, MetricType } from '../types/field';
import { formatFieldValue, formatItemValue, formatValue } from './formatting';
import { dimension, metric, tableCalculation } from './formatting.mock';

describe('Formatting', () => {
    describe('format and round', () => {
        test('formatValue should return the right format', async () => {
            const kilometerOptions = {
                format: 'km',
            };
            expect(formatValue(5, kilometerOptions)).toEqual('5 km');
            expect(formatValue('5', kilometerOptions)).toEqual('5 km');
            expect(
                formatValue(5, {
                    format: 'mi',
                }),
            ).toEqual('5 mi');
            expect(formatValue(5, { format: 'usd' })).toEqual('$5.00');
            expect(formatValue(5, { format: 'gbp' })).toEqual('£5.00');
            expect(formatValue(5, { format: 'eur' })).toEqual('€5.00');

            const percentageOptions = {
                format: 'percent',
            };
            expect(formatValue(5, percentageOptions)).toEqual('500%');
            expect(formatValue(0.05, percentageOptions)).toEqual('5%');
            expect(formatValue('5', percentageOptions)).toEqual('500%');
            expect(formatValue('foo', percentageOptions)).toEqual('foo');
            expect(formatValue(false, percentageOptions)).toEqual('false');
            expect(formatValue(1103)).toEqual('1,103');

            expect(formatValue(5, { format: '' })).toEqual('5');
            expect(formatValue(5)).toEqual('5');

            // Intl.NumberFormat rounds up after 3 decimals
            expect(formatValue(5.9)).toEqual('5.9');
            expect(formatValue(5.99)).toEqual('5.99');
            expect(formatValue(5.999)).toEqual('5.999');
            expect(formatValue(5.9999)).toEqual('6');
            expect(formatValue(5.99999)).toEqual('6');

            // ids are not comma separated
            expect(formatValue(1019, { format: 'id' })).toEqual('1019');
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
                    format: 'km',
                    round: 2,
                }),
            ).toEqual('5.00 km');
            expect(
                formatValue(5, {
                    format: 'km',
                    round: -2,
                }),
            ).toEqual('5 km');
            expect(
                formatValue(5, {
                    format: 'mi',
                    round: 4,
                }),
            ).toEqual('5.0000 mi');
            expect(
                formatValue(5, {
                    format: 'mi',
                    round: -4,
                }),
            ).toEqual('5 mi');
            expect(
                formatValue(5, {
                    format: 'usd',
                    round: 2,
                }),
            ).toEqual('$5.00');
            expect(
                formatValue(5.0, {
                    format: 'usd',
                    round: 0,
                }),
            ).toEqual('$5');
            expect(
                formatValue(5, {
                    format: 'usd',
                    round: -2,
                }),
            ).toEqual('$5.00');
            expect(
                formatValue(5.25, {
                    format: 'usd',
                    round: -1,
                }),
            ).toEqual('$5.25');
            expect(
                formatValue('5.0000', {
                    format: 'usd',
                    round: 2,
                }),
            ).toEqual('$5.00');
            expect(
                formatValue(5, {
                    format: 'gbp',
                    round: 2,
                }),
            ).toEqual('£5.00');
            expect(
                formatValue(5, {
                    format: 'gbp',
                    round: -2,
                }),
            ).toEqual('£5.00');
            expect(
                formatValue(5.25, {
                    format: 'gbp',
                    round: -2,
                }),
            ).toEqual('£5.25');
            expect(
                formatValue(5, {
                    format: 'eur',
                    round: 2,
                }),
            ).toEqual('€5.00');
            expect(
                formatValue(5, {
                    format: 'eur',
                    round: -2,
                }),
            ).toEqual('€5.00');
            expect(
                formatValue(5.25, {
                    format: 'eur',
                    round: -2,
                }),
            ).toEqual('€5.25');
            expect(
                formatValue(5, {
                    format: 'percent',
                    round: 2,
                }),
            ).toEqual('500.00%');
            expect(
                formatValue(0.05, {
                    format: 'percent',
                    round: 2,
                }),
            ).toEqual('5.00%');
            expect(
                formatValue('5', {
                    format: 'percent',
                    round: 2,
                }),
            ).toEqual('500.00%');
            expect(
                formatValue(0.0511, {
                    format: 'percent',
                    round: 2,
                }),
            ).toEqual('5.11%');
            expect(
                formatValue(0.0511, {
                    format: 'percent',
                    round: 4,
                }),
            ).toEqual('5.1100%');
            expect(
                formatValue('foo', {
                    format: 'percent',
                    round: 2,
                }),
            ).toEqual('foo');
            expect(
                formatValue(false, {
                    format: 'percent',
                    round: 2,
                }),
            ).toEqual('false');
            expect(
                formatValue(0.05, {
                    format: 'percent',
                    round: -2,
                }),
            ).toEqual('5%');
            expect(
                formatValue('5', {
                    format: 'percent',
                    round: -2,
                }),
            ).toEqual('500%');
            expect(
                formatValue(5, {
                    format: '',
                    round: 2,
                }),
            ).toEqual('5.00');
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
                formatValue(5000, { compact: T, round: 2, format: 'km' }),
            ).toEqual('5.00K km');
            expect(
                formatValue(50000, {
                    compact: T,
                    round: 4,
                    format: 'mi',
                }),
            ).toEqual('50.0000K mi');
            expect(
                formatValue(5000, {
                    compact: T,
                    round: 2,
                    format: 'usd',
                }),
            ).toEqual('$5.00K');
            expect(
                formatValue(5000000, {
                    compact: T,
                    round: 2,
                    format: 'usd',
                }),
            ).toEqual('$5,000.00K');
            expect(
                formatValue(5000000, {
                    compact: M,
                    round: 2,
                    format: 'usd',
                }),
            ).toEqual('$5.00M');

            expect(
                formatValue(4, {
                    compact: T,
                    round: 2,
                    format: 'usd',
                }),
            ).toEqual('$0.00K');
            expect(
                formatValue(4, {
                    compact: T,
                    round: 3,
                    format: 'usd',
                }),
            ).toEqual('$0.004K');

            expect(
                formatValue(5000000, {
                    compact: M,
                    round: 2,
                    format: 'usd',
                }),
            ).toEqual('$5.00M');
            expect(
                formatValue(5000000000, {
                    compact: M,
                    round: 2,
                    format: 'usd',
                }),
            ).toEqual('$5,000.00M');
            expect(
                formatValue(5000000000, {
                    compact: B,
                    round: 2,
                    format: 'usd',
                }),
            ).toEqual('$5.00B');

            expect(
                formatValue(5000.0, {
                    compact: T,
                    round: 0,
                    format: 'usd',
                }),
            ).toEqual('$5K');
            expect(
                formatValue('5000', {
                    compact: T,
                    round: 2,
                    format: 'usd',
                }),
            ).toEqual('$5.00K');
            expect(
                formatValue(5000, {
                    compact: T,
                    round: 2,
                    format: 'gbp',
                }),
            ).toEqual('£5.00K');
            expect(
                formatValue(5000, {
                    compact: T,
                    round: 2,
                    format: 'eur',
                }),
            ).toEqual('€5.00K');
            expect(
                formatValue(0.05, {
                    compact: T,
                    round: 2,
                    format: 'percent',
                }),
            ).toEqual('5.00%'); // No affects percent
            expect(
                formatValue(5000, {
                    compact: T,
                    round: 2,
                    format: '',
                }),
            ).toEqual('5.00K');
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
            ).toEqual('Yes');
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
});
