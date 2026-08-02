import {
    CustomDimensionType,
    DimensionType,
    type ChartAsCode,
} from '@lightdash/common';
import { CoderService } from './CoderService';

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
            CoderService.getChartContentAsCodePermissionChecks(chart, {
                metricQuery: chart.metricQuery,
            }),
        ).toEqual([]);
    });

    it('detects new and changed SQL-bearing chart items only', () => {
        const current: NonNullable<
            Parameters<
                typeof CoderService.getChartContentAsCodePermissionChecks
            >[1]
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
                    {
                        id: 'new_dim',
                        name: 'new_dim',
                        table: 'orders',
                        type: CustomDimensionType.SQL,
                        sql: '${TABLE}.category',
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
                    {
                        name: 'new_calc',
                        displayName: 'New calc',
                        sql: '${orders.count} + 3',
                    },
                ],
            },
        } as ChartAsCode;

        expect(
            CoderService.getChartContentAsCodePermissionChecks(next, current),
        ).toEqual([
            {
                check: 'customSqlDimension',
                message:
                    'User cannot upload content with new or modified custom SQL dimensions: dim, new_dim (chart slug "chart")',
            },
            {
                check: 'sqlTableCalculation',
                message:
                    'User cannot upload content with new or modified SQL table calculations: calc, new_calc (chart slug "chart")',
            },
        ]);
    });
});
