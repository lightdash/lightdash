import moment from 'moment';
import {
    DimensionType,
    formatFieldValue,
    formatItemValue,
    formatValue,
    getFilterRuleWithDefaultValue,
    MetricType,
    NumberStyle,
} from '.';
import {
    dateDayDimension,
    dateMonthDimension,
    dateYearDimension,
    dimension,
    emptyValueFilter,
    metric,
    tableCalculation,
} from './index.mock';

describe('Common index', () => {
    describe('format and round', () => {
        test('formatValue should return the right format', async () => {
            expect(formatValue('km', undefined, 5)).toEqual('5 km');
            expect(formatValue('km', undefined, '5')).toEqual('5 km');

            expect(formatValue('mi', undefined, 5)).toEqual('5 mi');
            expect(formatValue('usd', undefined, 5)).toEqual('$5.00');
            expect(formatValue('gbp', undefined, 5)).toEqual('£5.00');
            expect(formatValue('eur', undefined, 5)).toEqual('€5.00');
            expect(formatValue('percent', undefined, 5)).toEqual('500%');
            expect(formatValue('percent', undefined, 0.05)).toEqual('5%');
            expect(formatValue('percent', undefined, '5')).toEqual('500%');
            expect(formatValue('percent', undefined, 'foo')).toEqual('foo');
            expect(formatValue('percent', undefined, false)).toEqual('false');
            expect(formatValue(undefined, undefined, 1103)).toEqual('1,103');

            expect(formatValue('', undefined, 5)).toEqual('5');
            expect(formatValue(undefined, undefined, 5)).toEqual('5');

            // Intl.NumberFormat rounds up after 3 decimals
            expect(formatValue(undefined, undefined, 5.9)).toEqual('5.9');
            expect(formatValue(undefined, undefined, 5.99)).toEqual('5.99');
            expect(formatValue(undefined, undefined, 5.999)).toEqual('5.999');
            expect(formatValue(undefined, undefined, 5.9999)).toEqual('6');
            expect(formatValue(undefined, undefined, 5.99999)).toEqual('6');
        });
        test('formatValue should return the right round', async () => {
            expect(formatValue(undefined, 0, 1)).toEqual('1');
            expect(formatValue(undefined, 0, 10)).toEqual('10');
            expect(formatValue(undefined, 0, 100)).toEqual('100');
            expect(formatValue(undefined, 0, 1000)).toEqual('1,000');
            expect(formatValue(undefined, 0, 10000)).toEqual('10,000');
            expect(formatValue(undefined, 0, 100000)).toEqual('100,000');
            expect(formatValue(undefined, 0, 1000000)).toEqual('1,000,000');
            expect(formatValue(undefined, 2, 5)).toEqual('5.00');
            expect(formatValue(undefined, 2, 5.001)).toEqual('5.00');
            expect(formatValue(undefined, 2, 5.555)).toEqual('5.56');
            expect(formatValue(undefined, 2, 5.5555)).toEqual('5.56');
            expect(formatValue(undefined, 2, 5.9999999)).toEqual('6.00');

            expect(formatValue(undefined, 0, 5)).toEqual('5');
            expect(formatValue(undefined, 0, 5.001)).toEqual('5');
            expect(formatValue(undefined, 0, 5.9999999)).toEqual('6');

            // negative rounding not supported
            expect(formatValue(undefined, -1, 5)).toEqual('5');

            expect(formatValue(undefined, 2, 'foo')).toEqual('foo');
            expect(formatValue(undefined, 2, false)).toEqual('false');

            expect(formatValue(undefined, 10, 5)).toEqual('5.0000000000');
            expect(formatValue(undefined, 10, 5.001)).toEqual('5.0010000000');
            expect(formatValue(undefined, 10, 5.9999999)).toEqual(
                '5.9999999000',
            );
        });

        test('formatValue should return the right format and round', async () => {
            expect(formatValue('km', 2, 5)).toEqual('5.00 km');
            expect(formatValue('km', -2, 5)).toEqual('5 km');
            expect(formatValue('mi', 4, 5)).toEqual('5.0000 mi');
            expect(formatValue('mi', -4, 5)).toEqual('5 mi');
            expect(formatValue('usd', 2, 5)).toEqual('$5.00');
            expect(formatValue('usd', 0, 5.0)).toEqual('$5');
            expect(formatValue('usd', -2, 5)).toEqual('$5.00');
            expect(formatValue('usd', -1, 5.25)).toEqual('$5.25');
            expect(formatValue('usd', 2, '5.0000')).toEqual('$5.00');
            expect(formatValue('gbp', 2, 5)).toEqual('£5.00');
            expect(formatValue('gbp', -2, 5)).toEqual('£5.00');
            expect(formatValue('gbp', -2, 5.25)).toEqual('£5.25');
            expect(formatValue('eur', 2, 5)).toEqual('€5.00');
            expect(formatValue('eur', -2, 5)).toEqual('€5.00');
            expect(formatValue('eur', -2, 5.25)).toEqual('€5.25');
            expect(formatValue('percent', 2, 5)).toEqual('500.00%');
            expect(formatValue('percent', 2, 0.05)).toEqual('5.00%');
            expect(formatValue('percent', 2, '5')).toEqual('500.00%');
            expect(formatValue('percent', 2, 0.0511)).toEqual('5.11%');
            expect(formatValue('percent', 4, 0.0511)).toEqual('5.1100%');
            expect(formatValue('percent', 2, 'foo')).toEqual('foo');
            expect(formatValue('percent', 2, false)).toEqual('false');
            expect(formatValue('percent', -2, 0.05)).toEqual('5%');
            expect(formatValue('percent', -2, '5')).toEqual('500%');
            expect(formatValue('', 2, 5)).toEqual('5.00');
        });

        test('formatValue should return the right style', async () => {
            const T = NumberStyle.THOUSANDS;
            const M = NumberStyle.MILLIONS;
            const B = NumberStyle.BILLIONS;
            expect(formatValue(undefined, undefined, 5, T)).toEqual('0.01K');
            expect(formatValue(undefined, undefined, 5, M)).toEqual('0.00M');
            expect(formatValue(undefined, undefined, 500000, B)).toEqual(
                '0.00B',
            );
            expect(formatValue(undefined, undefined, 5, B)).toEqual('0.00B');
            expect(formatValue(undefined, 2, 5, M)).toEqual('0.00M');

            expect(formatValue('km', 2, 5000, T)).toEqual('5.00K km');
            expect(formatValue('mi', 4, 50000, T)).toEqual('50.0000K mi');
            expect(formatValue('usd', 2, 5000, T)).toEqual('$5.00K');
            expect(formatValue('usd', 2, 5000000, T)).toEqual('$5,000.00K');
            expect(formatValue('usd', 2, 5000000, M)).toEqual('$5.00M');

            expect(formatValue('usd', 2, 4, T)).toEqual('$0.00K');
            expect(formatValue('usd', 3, 4, T)).toEqual('$0.004K');

            expect(formatValue('usd', 2, 5000000, M)).toEqual('$5.00M');
            expect(formatValue('usd', 2, 5000000000, M)).toEqual('$5,000.00M');
            expect(formatValue('usd', 2, 5000000000, B)).toEqual('$5.00B');

            expect(formatValue('usd', 0, 5000.0, T)).toEqual('$5K');
            expect(formatValue('usd', 2, '5000', T)).toEqual('$5.00K');
            expect(formatValue('gbp', 2, 5000, T)).toEqual('£5.00K');
            expect(formatValue('eur', 2, 5000, T)).toEqual('€5.00K');
            expect(formatValue('percent', 2, 0.05, T)).toEqual('5.00%'); // No affects percent
            expect(formatValue('', 2, 5000, T)).toEqual('5.00K');
        });
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

    describe('default values on filter rule', () => {
        // TODO mock some timezones
        test('should return right default day value', async () => {
            const date = moment().format('YYYY-MM-DD');

            expect(
                getFilterRuleWithDefaultValue(
                    dateDayDimension,
                    emptyValueFilter,
                    undefined,
                ).values,
            ).toEqual([date]);
        });

        test('should return right default month value', async () => {
            const date = moment().format('YYYY-MM-01');

            expect(
                getFilterRuleWithDefaultValue(
                    dateMonthDimension,
                    emptyValueFilter,
                    undefined,
                ).values,
            ).toEqual([date]);
        });

        test('should return right default year value', async () => {
            const date = moment().format('YYYY-01-01');

            expect(
                getFilterRuleWithDefaultValue(
                    dateYearDimension,
                    emptyValueFilter,
                    undefined,
                ).values,
            ).toEqual([date]);
        });
    });
});
