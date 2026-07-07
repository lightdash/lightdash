import {
    CustomDimensionType,
    DimensionType,
    type ChartAsCode,
} from '@lightdash/common';
import { getChartContentAsCodePermissionChecks } from './contentAsCodePermissions';

const baseChart = {
    name: 'Chart',
    slug: 'chart',
    spaceSlug: 'space',
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: [],
        metrics: [],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
        customDimensions: [],
    },
} as unknown as ChartAsCode;

describe('content-as-code SQL permission detector', () => {
    it('allows unchanged SQL custom dimensions and table calculations', () => {
        const chart = {
            ...baseChart,
            metricQuery: {
                ...baseChart.metricQuery,
                customDimensions: [
                    {
                        id: 'dim',
                        name: 'dim',
                        table: 'orders',
                        type: CustomDimensionType.SQL,
                        sql: '${TABLE}.status',
                        dimensionType: DimensionType.STRING,
                    },
                ],
                tableCalculations: [
                    {
                        name: 'calc',
                        displayName: 'Calc',
                        sql: '${orders.count} + 1',
                    },
                ],
            },
        } as ChartAsCode;

        expect(
            getChartContentAsCodePermissionChecks(chart, {
                metricQuery: chart.metricQuery,
            }),
        ).toEqual([]);
    });

    it('detects new and changed SQL-bearing chart items only', () => {
        const current: NonNullable<
            Parameters<typeof getChartContentAsCodePermissionChecks>[1]
        > = {
            metricQuery: {
                customDimensions: [
                    {
                        id: 'dim',
                        name: 'dim',
                        table: 'orders',
                        type: CustomDimensionType.SQL,
                        sql: '${TABLE}.status',
                        dimensionType: DimensionType.STRING,
                    },
                ],
                tableCalculations: [
                    {
                        name: 'calc',
                        displayName: 'Calc',
                        sql: '${orders.count} + 1',
                    },
                ],
            },
        };
        const next = {
            ...baseChart,
            metricQuery: {
                ...baseChart.metricQuery,
                customDimensions: [
                    {
                        id: 'dim',
                        name: 'dim',
                        table: 'orders',
                        type: CustomDimensionType.SQL,
                        sql: '${TABLE}.new_status',
                        dimensionType: DimensionType.STRING,
                    },
                ],
                tableCalculations: [
                    {
                        name: 'calc',
                        displayName: 'Calc',
                        sql: '${orders.count} + 2',
                    },
                    {
                        name: 'formula',
                        displayName: 'Formula',
                        formula: '=A1',
                    },
                ],
            },
        } as ChartAsCode;

        expect(
            getChartContentAsCodePermissionChecks(next, current),
        ).toMatchObject([
            { check: 'customSqlDimension' },
            { check: 'sqlTableCalculation' },
        ]);
    });
});
