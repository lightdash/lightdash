import {
    BinType,
    CustomDimensionType,
    MetricType,
    type CreateSavedChartVersion,
    type CustomBinDimension,
} from '..';
import { maybeReplaceFieldsInChartVersion } from './charts';

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
