import {
    BinType,
    ChartType,
    CustomDimensionType,
    MetricType,
    type CartesianChartLayout,
    type ChartConfig,
    type CreateSavedChartVersion,
    type CustomBinDimension,
} from '..';
import {
    applyNewChartDefaults,
    maybeReplaceFieldsInChartVersion,
} from './charts';

it('preserves custom bins and their sorts while replacing custom metrics', () => {
    const customBin: CustomBinDimension = {
        id: 'amount_range',
        name: 'Amount range',
        table: 'orders',
        type: CustomDimensionType.BIN,
        dimensionId: 'orders_amount',
        binType: BinType.FIXED_WIDTH,
        binWidth: 10,
    };
    const chartVersion = {
        metricQuery: {
            additionalMetrics: [
                {
                    name: 'revenue',
                    label: 'Revenue',
                    table: 'orders',
                    type: MetricType.SUM,
                    sql: '${TABLE}.revenue',
                },
            ],
            customDimensions: [customBin],
            sorts: [{ fieldId: customBin.id, descending: false }],
        },
    } as CreateSavedChartVersion;

    const result = maybeReplaceFieldsInChartVersion({
        chartVersion,
        fieldsToReplace: {
            customMetrics: {
                orders_revenue: { replaceWithFieldId: 'orders_revenue' },
            },
        },
    });

    expect(result.hasChanges).toBe(true);
    expect(result.chartVersion.metricQuery.customDimensions).toEqual([
        customBin,
    ]);
    expect(result.chartVersion.metricQuery.sorts).toEqual([
        { fieldId: customBin.id, descending: false },
    ]);
});

describe('applyNewChartDefaults', () => {
    const cartesian = (layout: CartesianChartLayout): ChartConfig => ({
        type: ChartType.CARTESIAN,
        config: { layout, eChartsConfig: {} },
    });

    test('turns the incomplete period on for a new cartesian chart', () => {
        expect(applyNewChartDefaults(cartesian({ xField: 'x' }))).toEqual(
            cartesian({ xField: 'x', showIncompletePeriod: true }),
        );
    });

    test('keeps an explicit choice', () => {
        const config = cartesian({ showIncompletePeriod: false });
        expect(applyNewChartDefaults(config)).toBe(config);
    });

    test('leaves other chart types and missing configs alone', () => {
        const table: ChartConfig = { type: ChartType.TABLE };
        const emptyCartesian: ChartConfig = { type: ChartType.CARTESIAN };
        expect(applyNewChartDefaults(table)).toBe(table);
        expect(applyNewChartDefaults(emptyCartesian)).toBe(emptyCartesian);
    });
});
