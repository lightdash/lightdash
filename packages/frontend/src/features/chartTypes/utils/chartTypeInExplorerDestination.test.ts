import {
    ChartType,
    type DataAppVizSchema,
    type MetricQuery,
} from '@lightdash/common';
import { beforeEach, describe, expect, it } from 'vitest';
import {
    buildChartTypeInExplorerDestination,
    chartTypeInExplorerPath,
    parseChartStudioOriginFromSearchParams,
} from './chartTypeInExplorerDestination';

const DATA_APP_VIZ_UUID = '1e9a3b2c-0000-4000-8000-000000000001';

const schema: DataAppVizSchema = {
    fields: [
        { name: 'source', label: 'Source', type: 'dimension', required: true },
        { name: 'series', label: 'Series', type: 'series', required: false },
        { name: 'value', label: 'Value', type: 'metric', required: true },
    ],
    configOptions: [],
    colorPalette: null,
};

const metricQuery: MetricQuery = {
    exploreName: 'customers',
    dimensions: ['customers_channel', 'customers_plan'],
    metrics: ['customers_count'],
    filters: {},
    sorts: [{ fieldId: 'customers_count', descending: true }],
    limit: 500,
    tableCalculations: [],
};

const build = () =>
    buildChartTypeInExplorerDestination({
        projectUuid: 'p1',
        dataAppVizUuid: DATA_APP_VIZ_UUID,
        exploreName: 'customers',
        metricQuery,
        schema,
        fieldMapping: {
            source: 'customers_channel',
            series: 'customers_plan',
            value: 'customers_count',
        },
        optionValues: { sourceOrder: 'largest' },
    });

describe('buildChartTypeInExplorerDestination', () => {
    beforeEach(() => {
        // The builder's own url carries state the Explorer has no use for.
        window.history.replaceState(
            {},
            '',
            '/?fromSpace=space-1&state=' + 'x'.repeat(4096),
        );
    });

    it('opens the explore on the query the chart type was built on', () => {
        const destination = build();
        const params = new URLSearchParams(destination.search);

        expect(destination.pathname).toBe('/projects/p1/tables/customers');
        expect(
            JSON.parse(params.get('create_saved_chart_version') ?? ''),
        ).toEqual({
            tableName: 'customers',
            metricQuery,
            pivotConfig: { columns: ['customers_plan'] },
            tableConfig: { columnOrder: [] },
            chartConfig: {
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizUuid: DATA_APP_VIZ_UUID,
                    fieldMapping: {
                        source: 'customers_channel',
                        series: 'customers_plan',
                        value: 'customers_count',
                    },
                    optionValues: { sourceOrder: 'largest' },
                },
            },
        });
    });

    it('carries only what the Explorer needs', () => {
        const params = new URLSearchParams(build().search);

        expect([...params.keys()].sort()).toEqual([
            'chartSidebar',
            'create_saved_chart_version',
            'fromChartStudio',
            'isExploreFromHere',
        ]);
        // The author asked for this query, so the Explorer runs it once.
        expect(params.get('isExploreFromHere')).toBe('true');
    });

    it('marks the arrival as coming from Chart Studio', () => {
        const params = new URLSearchParams(build().search);

        expect(params.get('fromChartStudio')).toBe(DATA_APP_VIZ_UUID);
        // The bound inputs are on screen beside the chart on arrival.
        expect(params.get('chartSidebar')).toBe('configure');
        expect(
            parseChartStudioOriginFromSearchParams(`?${params.toString()}`),
        ).toBe(DATA_APP_VIZ_UUID);
    });
});

describe('parseChartStudioOriginFromSearchParams', () => {
    it('ignores a missing or non-uuid marker', () => {
        expect(parseChartStudioOriginFromSearchParams('')).toBeNull();
        expect(
            parseChartStudioOriginFromSearchParams('?fromChartStudio=nonsense'),
        ).toBeNull();
    });
});

describe('chartTypeInExplorerPath', () => {
    it('preselects the chart type with its config panel open', () => {
        expect(
            chartTypeInExplorerPath('p1', 'customers', DATA_APP_VIZ_UUID),
        ).toBe(
            `/projects/p1/tables/customers?dataAppVizUuid=${DATA_APP_VIZ_UUID}&chartSidebar=configure`,
        );
    });
});
