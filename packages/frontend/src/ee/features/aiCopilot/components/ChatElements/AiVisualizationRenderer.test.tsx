import {
    AiResultType,
    type ApiAiAgentThreadMessageVizQuery,
    type ToolRunQueryArgs,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { AiVisualizationRenderer } from './AiVisualizationRenderer';

const mocks = vi.hoisted(() => ({
    useExplore: vi.fn(),
}));

vi.mock('../../../../../hooks/health/useHealth', () => ({
    default: () => ({ data: { query: { maxLimit: 5_000 } } }),
}));

vi.mock('../../../../../hooks/appearance/useProjectColorPalette', () => ({
    useProjectColorPalette: () => ({ data: undefined }),
}));

vi.mock('../../../../../hooks/useExplore', () => ({
    useExplore: mocks.useExplore,
}));

vi.mock('../../hooks/aiAgentRouting', () => ({
    isEmbedAiAgentRoute: () => false,
}));

vi.mock(
    '../../../../../components/MetricQueryData/MetricQueryDataProvider',
    () => ({
        default: ({ children }: { children: ReactNode }) => children,
    }),
);

vi.mock(
    '../../../../../components/LightdashVisualization/VisualizationProvider',
    () => ({
        default: ({
            children,
            onSeriesContextMenu,
        }: {
            children: ReactNode;
            onSeriesContextMenu?: unknown;
        }) => (
            <div
                data-testid="visualization-provider"
                data-context-menu-enabled={String(
                    onSeriesContextMenu !== undefined,
                )}
            >
                {children}
            </div>
        ),
    }),
);

vi.mock('../../../../../components/LightdashVisualization', () => ({
    default: ({ enableContextMenu }: { enableContextMenu?: boolean }) => (
        <div
            data-testid="lightdash-visualization"
            data-context-menu-enabled={String(enableContextMenu)}
        />
    ),
}));

vi.mock(
    '../../../../../components/Explorer/VisualizationCard/SeriesContextMenu',
    () => ({
        SeriesContextMenu: () => <div data-testid="series-context-menu" />,
    }),
);

vi.mock(
    '../../../../../components/MetricQueryData/UnderlyingDataModal',
    () => ({
        default: () => <div data-testid="underlying-data-modal" />,
    }),
);

vi.mock('../../../../../components/MetricQueryData/DrillDownModal', () => ({
    DrillDownModal: () => <div data-testid="drill-down-modal" />,
}));

const metricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_order_month'],
    metrics: ['orders_total_revenue'],
    sorts: [],
    limit: 500,
    filters: {},
    tableCalculations: [],
    additionalMetrics: [],
};

const vizQueryData = {
    source: 'semantic' as const,
    type: AiResultType.QUERY_RESULT,
    query: {
        queryUuid: '11111111-1111-4111-8111-111111111111',
        metricQuery,
        fields: {},
        cacheMetadata: { cacheHit: false },
        parameterReferences: [],
        resolvedTimezone: 'UTC',
        usedParametersValues: {},
        warnings: [],
    },
    mergeQuery: null,
    metadata: { title: 'Revenue trend', description: 'Revenue by month.' },
} as ApiAiAgentThreadMessageVizQuery;

const chartConfig: ToolRunQueryArgs = {
    title: 'Revenue trend',
    description: 'Revenue by month.',
    queryConfig: {
        exploreName: 'orders',
        dimensions: ['orders_order_month'],
        metrics: ['orders_total_revenue'],
        sorts: [],
        limit: 500,
        parameters: null,
        filters: null,
        customMetrics: null,
        tableCalculations: null,
    },
    chartConfig: {
        defaultVizType: 'line',
        xAxisDimension: 'orders_order_month',
        yAxisMetrics: ['orders_total_revenue'],
        groupBy: null,
        xAxisType: 'time',
        stackBars: null,
        lineType: 'line',
        xAxisLabel: 'Month',
        yAxisLabel: 'Revenue',
        secondaryYAxisMetric: null,
        secondaryYAxisLabel: null,
    },
};

const results = {
    rows: [],
    isFetchingRows: false,
} as unknown as InfiniteQueryResults;

const renderVisualization = (interactionMode?: 'full' | 'read-only') =>
    renderWithProviders(
        <AiVisualizationRenderer
            vizQueryData={vizQueryData}
            results={results}
            chartConfig={chartConfig}
            selectedChartType="line"
            displayFields={false}
            displayFilters={false}
            loadExplore
            interactionMode={interactionMode}
        />,
    );

describe('AiVisualizationRenderer interaction mode', () => {
    beforeEach(() => {
        mocks.useExplore.mockReset();
        mocks.useExplore.mockReturnValue({ data: undefined });
    });

    it('keeps the visualization but removes analytical controls in read-only mode', () => {
        renderVisualization('read-only');

        expect(screen.getByTestId('lightdash-visualization')).toBeVisible();
        expect(screen.getByTestId('lightdash-visualization')).toHaveAttribute(
            'data-context-menu-enabled',
            'false',
        );
        expect(screen.getByTestId('visualization-provider')).toHaveAttribute(
            'data-context-menu-enabled',
            'false',
        );
        expect(mocks.useExplore).toHaveBeenCalledWith(undefined);
        expect(screen.queryByTestId('series-context-menu')).toBeNull();
        expect(screen.queryByTestId('underlying-data-modal')).toBeNull();
        expect(screen.queryByTestId('drill-down-modal')).toBeNull();
    });

    it('preserves existing analytical controls by default', () => {
        renderVisualization();

        expect(screen.getByTestId('lightdash-visualization')).toBeVisible();
        expect(screen.getByTestId('lightdash-visualization')).toHaveAttribute(
            'data-context-menu-enabled',
            'true',
        );
        expect(screen.getByTestId('visualization-provider')).toHaveAttribute(
            'data-context-menu-enabled',
            'true',
        );
        expect(mocks.useExplore).toHaveBeenCalledWith('orders');
        expect(screen.getByTestId('series-context-menu')).toBeVisible();
        expect(screen.getByTestId('underlying-data-modal')).toBeVisible();
        expect(screen.getByTestId('drill-down-modal')).toBeVisible();
    });
});

describe('AiVisualizationRenderer parameters', () => {
    const renderWithParameters = (
        query: Partial<ApiAiAgentThreadMessageVizQuery['query']>,
    ) =>
        renderWithProviders(
            <AiVisualizationRenderer
                vizQueryData={{
                    ...vizQueryData,
                    query: { ...vizQueryData.query, ...query },
                }}
                results={results}
                chartConfig={chartConfig}
                selectedChartType="line"
                displayFields={false}
                displayFilters={false}
                loadExplore
            />,
        );

    it('shows the parameter values the query ran with', () => {
        renderWithParameters({
            parameterReferences: ['events.event_status'],
            usedParametersValues: { 'events.event_status': 'song_played' },
        });

        expect(screen.getByText('Parameters 1')).toBeVisible();
        expect(screen.getByText('Event status')).toBeInTheDocument();
        expect(screen.getByText('song_played')).toBeInTheDocument();
    });

    it('hides unreferenced project-wide parameter values', () => {
        renderWithParameters({
            parameterReferences: [],
            usedParametersValues: { unrelated_default: 'x' },
        });

        expect(screen.queryByText(/Parameters/)).toBeNull();
        expect(screen.queryByText('x')).toBeNull();
    });
});
