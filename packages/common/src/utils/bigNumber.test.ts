import { DimensionType, FieldType, type ItemsMap } from '../types/field';
import { DateGranularity, TimeFrames } from '../types/timeFrames';
import {
    getGranularityMapFromItems,
    resolveGranularityInLabel,
} from './bigNumber';

describe('resolveGranularityInLabel', () => {
    it('replaces ${field.granularity} with lowercase granularity value', () => {
        expect(
            resolveGranularityInLabel(
                'compared to last ${events_date.granularity}',
                { events_date: DateGranularity.WEEK },
            ),
        ).toBe('compared to last week');
    });

    it('replaces multiple different field references', () => {
        expect(
            resolveGranularityInLabel(
                '${events_date.granularity} and ${orders_created.granularity}',
                {
                    events_date: DateGranularity.MONTH,
                    orders_created: DateGranularity.WEEK,
                },
            ),
        ).toBe('month and week');
    });

    it('replaces multiple occurrences of the same field', () => {
        expect(
            resolveGranularityInLabel(
                '${events_date.granularity} over ${events_date.granularity}',
                { events_date: DateGranularity.MONTH },
            ),
        ).toBe('month over month');
    });

    it('returns label unchanged when no placeholders present', () => {
        expect(
            resolveGranularityInLabel('static label', {
                events_date: DateGranularity.DAY,
            }),
        ).toBe('static label');
    });

    it('returns label unchanged when granularity map is empty', () => {
        expect(
            resolveGranularityInLabel(
                'compared to last ${events_date.granularity}',
                {},
            ),
        ).toBe('compared to last ${events_date.granularity}');
    });

    it('leaves unmatched placeholders as-is', () => {
        expect(
            resolveGranularityInLabel(
                '${events_date.granularity} vs ${unknown_field.granularity}',
                { events_date: DateGranularity.DAY },
            ),
        ).toBe('day vs ${unknown_field.granularity}');
    });

    it('returns undefined when label is undefined', () => {
        expect(
            resolveGranularityInLabel(undefined, {
                events_date: DateGranularity.WEEK,
            }),
        ).toBeUndefined();
    });

    it('works with all DateGranularity values', () => {
        const map = { d: DateGranularity.DAY };
        expect(resolveGranularityInLabel('${d.granularity}', map)).toBe('day');

        map.d = DateGranularity.WEEK;
        expect(resolveGranularityInLabel('${d.granularity}', map)).toBe('week');

        map.d = DateGranularity.MONTH;
        expect(resolveGranularityInLabel('${d.granularity}', map)).toBe(
            'month',
        );

        map.d = DateGranularity.QUARTER;
        expect(resolveGranularityInLabel('${d.granularity}', map)).toBe(
            'quarter',
        );

        map.d = DateGranularity.YEAR;
        expect(resolveGranularityInLabel('${d.granularity}', map)).toBe('year');
    });
});

describe('getGranularityMapFromItems', () => {
    it('maps time interval child dimensions to their base field id', () => {
        const itemsMap = {
            orders_order_date_week: {
                fieldType: FieldType.DIMENSION,
                type: DimensionType.DATE,
                table: 'orders',
                name: 'order_date_week',
                label: 'Order date week',
                timeInterval: TimeFrames.WEEK,
                timeIntervalBaseDimensionName: 'order_date',
            },
        } as unknown as ItemsMap;

        expect(getGranularityMapFromItems(itemsMap)).toEqual({
            orders_order_date: DateGranularity.WEEK,
        });
    });

    it('uses the active date zoom granularity for the matching base field id', () => {
        const itemsMap = {
            orders_order_date_month: {
                fieldType: FieldType.DIMENSION,
                type: DimensionType.DATE,
                table: 'orders',
                name: 'order_date_month',
                label: 'Order date month',
                timeInterval: TimeFrames.MONTH,
                timeIntervalBaseDimensionName: 'order_date',
            },
        } as unknown as ItemsMap;

        expect(
            getGranularityMapFromItems(itemsMap, {
                granularity: DateGranularity.WEEK,
                xAxisFieldId: 'orders_order_date',
            }),
        ).toEqual({
            orders_order_date: DateGranularity.WEEK,
        });
    });

    it('keeps custom time interval labels when date zoom targets a different field', () => {
        const itemsMap = {
            orders_order_date_fiscal_quarter: {
                fieldType: FieldType.DIMENSION,
                type: DimensionType.STRING,
                table: 'orders',
                name: 'order_date_fiscal_quarter',
                label: 'Fiscal quarter',
                customTimeInterval: 'fiscal_quarter',
                timeIntervalBaseDimensionName: 'order_date',
            },
        } as unknown as ItemsMap;

        expect(
            getGranularityMapFromItems(itemsMap, {
                granularity: DateGranularity.WEEK,
                xAxisFieldId: 'orders_created_at',
            }),
        ).toEqual({
            orders_order_date: 'Fiscal quarter',
        });
    });
});
