import {
    ChartType,
    DimensionType,
    FieldType,
    QuerySourceType,
    type ComposerChart,
    type ComposerChartRunResults,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { type FC } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import ChartColorMappingContextProvider from '../../../hooks/useChartColorConfig/ChartColorMappingContextProvider';
import { renderWithProviders } from '../../../testing/testUtils';
import { useComposerChartDraw } from '../hooks/useComposerChartDraw';
import { ComposerChartVisualization } from './ComposerChartVisualization';

vi.mock('../../../api');
vi.mock('../../../hooks/useQueryResults', () => ({
    useInfiniteQueryResults: (_project: string, queryUuid?: string) => ({
        queryUuid,
        columns: queryUuid
            ? {
                  status: { reference: 'status', type: DimensionType.STRING },
                  revenue: { reference: 'revenue', type: DimensionType.NUMBER },
              }
            : undefined,
        rows: queryUuid
            ? [
                  {
                      status: {
                          value: { raw: 'shipped', formatted: 'shipped' },
                      },
                      revenue: { value: { raw: 42, formatted: '42' } },
                  },
              ]
            : [],
        totalResults: 1,
        hasFetchedAllRows: true,
        fetchAll: true,
        setFetchAll: () => {},
        isFetchingRows: false,
        error: null,
    }),
}));

const chart = {
    versionUuid: 'v1',
    pipeline: {
        schemaVersion: 1,
        terminalNodeId: 'orders',
        nodes: [
            {
                nodeId: 'orders',
                title: 'Orders',
                sourceType: QuerySourceType.SQL,
                sql: 'select 1',
            },
        ],
    },
    chart: {
        schemaVersion: 1,
        columns: [
            { reference: 'status', fieldType: FieldType.DIMENSION },
            { reference: 'revenue', fieldType: FieldType.METRIC },
        ],
        chartConfig: {
            type: ChartType.BIG_NUMBER,
            config: { selectedField: 'revenue', label: 'Revenue' },
        },
        pivotConfig: null,
        tableConfig: { columnOrder: ['status', 'revenue'] },
    },
} as unknown as ComposerChart;

const run = {
    queries: [
        {
            nodeId: 'orders',
            sourceType: QuerySourceType.SQL,
            queryUuid: 'terminal-query',
        },
    ],
    fields: {},
    chartStageQueryUuid: null,
    zoomedFieldLabels: {},
} as unknown as ComposerChartRunResults;

const StandaloneChart: FC = () => {
    const { draw, results, rows } = useComposerChartDraw({
        projectUuid: 'project-uuid',
        chart,
        run,
        title: 'Orders',
    });
    if (!draw) return null;
    return (
        <ComposerChartVisualization
            projectUuid="project-uuid"
            composerChartUuid="composer-chart-uuid"
            dashboardUuid={null}
            tileUuid={null}
            isDashboard={false}
            isTitleHidden={false}
            minimal={false}
            draw={draw}
            results={results}
            rows={rows}
            onScreenshotReady={() => {}}
            onScreenshotError={() => {}}
        />
    );
};

describe('ComposerChartVisualization', () => {
    it('draws a run without a dashboard or a tile', async () => {
        // App-level provider only: no dashboard store, context or tile
        renderWithProviders(
            <MemoryRouter>
                <ChartColorMappingContextProvider>
                    <StandaloneChart />
                </ChartColorMappingContextProvider>
            </MemoryRouter>,
        );
        expect(await screen.findByText('42')).toBeInTheDocument();
        expect(screen.getByText('Revenue')).toBeInTheDocument();
    });
});
