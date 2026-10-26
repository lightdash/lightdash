import {
    ChartType,
    type ChartConfig,
    type MetricQuery,
    type TableCalculationMetadata,
} from '@lightdash/common';
import { act, cleanup } from '@testing-library/react';
import { useState, type FC } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChartColorMappingContextProvider from '../../hooks/useChartColorConfig/ChartColorMappingContextProvider';
import { renderWithProviders } from '../../testing/testUtils';
import { columnOrder, results } from './visualizationDifferential.fixtures';
import VisualizationProvider from './VisualizationProvider';

vi.mock('@shopify/react-web-worker', () => ({
    createWorkerFactory: () => () => ({}),
    useWorker: () => ({}),
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useServerFeatureFlag: () => ({ data: undefined }),
}));

type Results = typeof results;
// An empty sql reads as a non-numeric table calculation
const numericResults: Results = {
    ...results,
    fields: {
        ...results.fields,
        margin: { ...results.fields.margin, sql: '1' },
    },
};
type Query = {
    resultsData: Results;
    unsavedMetricQuery: MetricQuery;
    tableCalculationsMetadata: TableCalculationMetadata[] | undefined;
};

const renameQuery = (metricQuery: MetricQuery, from: string, to: string) => ({
    ...metricQuery,
    tableCalculations: metricQuery.tableCalculations.map((tc) =>
        tc.name === from ? { ...tc, name: to } : tc,
    ),
});

/** What the explorer hands the provider after a rename and after the next run */
const renamed = (previous: Results, from: string, to: string) => {
    const { [from]: item, ...fields } = previous.fields;
    const metricQuery = renameQuery(previous.metricQuery, from, to);
    const rerun: Results = {
        ...previous,
        fields: { ...fields, [to]: { ...item, name: to } },
        rows: previous.rows.map(({ [from]: cell, ...row }) => ({
            ...row,
            [to]: cell,
        })),
        metricQuery,
    };
    return {
        beforeRun: {
            resultsData: previous,
            unsavedMetricQuery: metricQuery,
            tableCalculationsMetadata: [{ oldName: from, name: to }],
        },
        afterRun: {
            resultsData: rerun,
            unsavedMetricQuery: metricQuery,
            tableCalculationsMetadata: undefined,
        },
    } satisfies Record<string, Query>;
};

const fieldOf = (chartConfig: ChartConfig): string | null | undefined => {
    switch (chartConfig.type) {
        case ChartType.PIE:
            return chartConfig.config?.metricId;
        case ChartType.FUNNEL:
            return chartConfig.config?.fieldId;
        case ChartType.SANKEY:
            return chartConfig.config?.metricFieldId;
        case ChartType.TREEMAP:
            return chartConfig.config?.sizeMetricId;
        case ChartType.BIG_NUMBER:
            return chartConfig.config?.selectedField;
        default:
            throw new Error(
                `no table calculation field on ${chartConfig.type}`,
            );
    }
};

const cases: ChartConfig[] = [
    {
        type: ChartType.PIE,
        config: { groupFieldIds: ['orders_status'], metricId: 'margin' },
    },
    { type: ChartType.FUNNEL, config: { fieldId: 'margin' } },
    {
        type: ChartType.SANKEY,
        config: {
            sourceFieldId: 'orders_status',
            targetFieldId: 'orders_channel',
            metricFieldId: 'margin',
        },
    },
    {
        type: ChartType.TREEMAP,
        config: { groupFieldIds: ['orders_status'], sizeMetricId: 'margin' },
    },
    { type: ChartType.BIG_NUMBER, config: { selectedField: 'margin' } },
];

describe('VisualizationProvider table calculation renames', () => {
    afterEach(cleanup);

    it.each(cases.map((chartConfig) => [chartConfig.type, chartConfig]))(
        '%s keeps the renamed field through the rename, the run and a second rename',
        (_, initial) => {
            const emitted: ChartConfig[] = [];
            let setQuery: (query: Query) => void = () => {};
            const Explorer: FC = () => {
                const [chartConfig, setChartConfig] = useState(initial);
                const [query, setQueryState] = useState<Query>({
                    resultsData: numericResults,
                    unsavedMetricQuery: numericResults.metricQuery,
                    tableCalculationsMetadata: undefined,
                });
                setQuery = setQueryState;
                return (
                    <VisualizationProvider
                        initialPivotDimensions={undefined}
                        isLoading={false}
                        columnOrder={columnOrder}
                        colorPalette={['#111111', '#222222']}
                        chartConfig={chartConfig}
                        onChartConfigChange={(next) => {
                            emitted.push(next);
                            setChartConfig(next);
                        }}
                        {...query}
                    >
                        {null}
                    </VisualizationProvider>
                );
            };
            renderWithProviders(
                <MemoryRouter>
                    <ChartColorMappingContextProvider>
                        <Explorer />
                    </ChartColorMappingContextProvider>
                </MemoryRouter>,
            );

            const first = renamed(numericResults, 'margin', 'margin2');
            act(() => setQuery(first.beforeRun));
            act(() => setQuery(first.afterRun));
            const second = renamed(
                first.afterRun.resultsData,
                'margin2',
                'margin3',
            );
            act(() => setQuery(second.beforeRun));
            act(() => setQuery(second.afterRun));

            const fields = emitted.map(fieldOf);
            expect(fields.at(-1)).toBe('margin3');
            expect(
                fields.filter((field) => !field?.startsWith('margin')),
            ).toEqual([]);
        },
    );
});
