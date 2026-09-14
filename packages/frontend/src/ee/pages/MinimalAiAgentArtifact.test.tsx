import {
    AiResultType,
    ChartType,
    getDataAppVizChartFromArtifact,
    type AiCustomChartTypeChartArtifactConfig,
    type ApiAiAgentThreadMessageVizQuery,
    type ToolRunQueryArgs,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import MinimalAiAgentArtifact from './MinimalAiAgentArtifact';

const PROJECT_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AGENT_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ARTIFACT_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const VERSION_UUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const mocks = vi.hoisted(() => ({
    useAiAgentArtifact: vi.fn(),
    useAiAgentArtifactVizQuery: vi.fn(),
    useInfiniteQueryResults: vi.fn(),
    useExplore: vi.fn(),
}));

vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useParams: () => ({
        projectUuid: PROJECT_UUID,
        agentUuid: AGENT_UUID,
        artifactUuid: ARTIFACT_UUID,
        versionUuid: VERSION_UUID,
    }),
}));

vi.mock('../features/aiCopilot/hooks/useAiAgentArtifacts', () => ({
    useAiAgentArtifact: mocks.useAiAgentArtifact,
}));

vi.mock('../features/aiCopilot/hooks/useProjectAiAgents', () => ({
    useAiAgentArtifactVizQuery: mocks.useAiAgentArtifactVizQuery,
}));

vi.mock('../../hooks/useQueryResults', () => ({
    useInfiniteQueryResults: mocks.useInfiniteQueryResults,
}));

vi.mock('../../hooks/health/useHealth', () => ({
    default: () => ({ data: { query: { maxLimit: 5_000 } } }),
}));

vi.mock('../../hooks/appearance/useProjectColorPalette', () => ({
    useProjectColorPalette: () => ({ data: undefined }),
}));

vi.mock('../../hooks/useExplore', () => ({
    useExplore: mocks.useExplore,
}));

vi.mock('../features/aiCopilot/hooks/aiAgentRouting', () => ({
    isEmbedAiAgentRoute: () => false,
}));

vi.mock('../../components/MetricQueryData/MetricQueryDataProvider', () => ({
    default: ({ children }: { children: ReactNode }) => children,
}));

vi.mock(
    '../../components/LightdashVisualization/VisualizationProvider',
    () => ({
        default: ({
            children,
            onSeriesContextMenu,
            chartConfig,
            minimal,
        }: {
            children: ReactNode;
            onSeriesContextMenu?: unknown;
            chartConfig?: { type?: string; config?: unknown };
            minimal?: boolean;
        }) => (
            <div
                data-testid="visualization-provider"
                data-context-menu-enabled={String(
                    onSeriesContextMenu !== undefined,
                )}
                data-chart-config-type={chartConfig?.type}
                data-chart-config={JSON.stringify(chartConfig?.config)}
                data-minimal={String(minimal === true)}
            >
                {children}
            </div>
        ),
    }),
);

vi.mock('../../components/LightdashVisualization', () => ({
    default: ({
        enableContextMenu,
        onScreenshotReady,
        onScreenshotError,
    }: {
        enableContextMenu?: boolean;
        onScreenshotReady?: () => void;
        onScreenshotError?: () => void;
    }) => (
        <div
            data-testid="lightdash-visualization"
            data-context-menu-enabled={String(enableContextMenu)}
        >
            <button
                data-testid="signal-screenshot-ready"
                onClick={() => onScreenshotReady?.()}
            />
            <button
                data-testid="signal-screenshot-error"
                onClick={() => onScreenshotError?.()}
            />
        </div>
    ),
}));

vi.mock(
    '../../components/Explorer/VisualizationCard/SeriesContextMenu',
    () => ({
        SeriesContextMenu: () => <div data-testid="series-context-menu" />,
    }),
);

vi.mock('../../components/MetricQueryData/UnderlyingDataModal', () => ({
    default: () => <div data-testid="underlying-data-modal" />,
}));

vi.mock('../../components/MetricQueryData/DrillDownModal', () => ({
    DrillDownModal: () => <div data-testid="drill-down-modal" />,
}));

vi.mock(
    '../features/aiCopilot/components/ChatElements/AgentVisualizationChartTypeSwitcher',
    () => ({
        AgentVisualizationChartTypeSwitcher: () => (
            <div data-testid="chart-type-switcher" />
        ),
    }),
);

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
    metadata: { title: 'Revenue trend', description: null },
} as ApiAiAgentThreadMessageVizQuery;

// Verbatim tool args from the envelope — slug config intact.
const customToolArgs: ToolRunQueryArgs = {
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
        customChartTypeSlug: 'cohort-waterfall',
        fieldMapping: {
            x: 'orders_order_month',
            y: 'orders_total_revenue',
        },
        options: { showLegend: true },
    },
};

const customArtifactChartConfig: AiCustomChartTypeChartArtifactConfig = {
    source: 'customChartType',
    schemaVersion: 1,
    dataAppVizUuid: '22222222-2222-4222-8222-222222222222',
    config: customToolArgs,
};

const buildArtifact = (chartConfig: unknown = customArtifactChartConfig) => ({
    artifactUuid: ARTIFACT_UUID,
    versionUuid: VERSION_UUID,
    artifactType: 'chart',
    chartConfig,
});

const queryResults = {
    rows: [{ orders_order_month: { value: { raw: '2026-01' } } }],
    isFetchingRows: false,
    error: null,
    setFetchAll: vi.fn(),
};

const getReadyIndicator = () =>
    document.getElementById('lightdash-ready-indicator');

describe('MinimalAiAgentArtifact', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.useExplore.mockReturnValue({ data: undefined });
        mocks.useAiAgentArtifact.mockReturnValue({
            data: buildArtifact(),
            isLoading: false,
            error: null,
        });
        mocks.useAiAgentArtifactVizQuery.mockReturnValue({
            data: vizQueryData,
            isLoading: false,
            error: null,
        });
        mocks.useInfiniteQueryResults.mockReturnValue(queryResults);
    });

    it('derives the renderer chart config from the artifact exactly as the web thread does', () => {
        renderWithProviders(<MinimalAiAgentArtifact />);

        const provider = screen.getByTestId('visualization-provider');
        expect(provider).toHaveAttribute(
            'data-chart-config-type',
            ChartType.DATA_APP_VIZ,
        );
        expect(JSON.parse(provider.getAttribute('data-chart-config')!)).toEqual(
            getDataAppVizChartFromArtifact(customArtifactChartConfig),
        );
    });

    it('keeps analytical interactions structurally off', () => {
        renderWithProviders(<MinimalAiAgentArtifact />);

        const provider = screen.getByTestId('visualization-provider');
        expect(provider).toHaveAttribute('data-minimal', 'true');
        expect(provider).toHaveAttribute('data-context-menu-enabled', 'false');
        expect(screen.getByTestId('lightdash-visualization')).toHaveAttribute(
            'data-context-menu-enabled',
            'false',
        );
        expect(mocks.useExplore).toHaveBeenCalledWith(undefined);
        expect(screen.queryByTestId('underlying-data-modal')).toBeNull();
        expect(screen.queryByTestId('drill-down-modal')).toBeNull();
        expect(screen.queryByTestId('series-context-menu')).toBeNull();
        expect(screen.queryByTestId('chart-type-switcher')).toBeNull();
    });

    it('mounts the ready indicator only after the renderer signals ready', () => {
        renderWithProviders(<MinimalAiAgentArtifact />);

        expect(getReadyIndicator()).toBeNull();

        fireEvent.click(screen.getByTestId('signal-screenshot-ready'));

        expect(getReadyIndicator()).not.toBeNull();
        expect(getReadyIndicator()).toHaveAttribute('data-status', 'ready');
    });

    it('marks the tile errored when the renderer signals a screenshot error', () => {
        renderWithProviders(<MinimalAiAgentArtifact />);

        fireEvent.click(screen.getByTestId('signal-screenshot-error'));

        expect(getReadyIndicator()).toHaveAttribute(
            'data-status',
            'completed-with-errors',
        );
        // Renderer stays mounted — its terminal frame is what gets captured.
        expect(screen.getByTestId('visualization-provider')).toBeVisible();
    });

    it('does not mount the renderer or the ready indicator while rows are fetching', () => {
        mocks.useInfiniteQueryResults.mockReturnValue({
            ...queryResults,
            isFetchingRows: true,
        });

        renderWithProviders(<MinimalAiAgentArtifact />);

        expect(screen.queryByTestId('visualization-provider')).toBeNull();
        expect(getReadyIndicator()).toBeNull();
    });

    it('reports an errored ready indicator for non custom chart type artifacts', () => {
        mocks.useAiAgentArtifact.mockReturnValue({
            data: buildArtifact({
                source: 'semantic',
                config: customToolArgs,
            }),
            isLoading: false,
            error: null,
        });
        mocks.useAiAgentArtifactVizQuery.mockReturnValue({
            data: undefined,
            isLoading: false,
            error: null,
        });

        renderWithProviders(<MinimalAiAgentArtifact />);

        expect(screen.queryByTestId('visualization-provider')).toBeNull();
        expect(
            screen.getByText(
                'This artifact is not a custom chart type answer.',
            ),
        ).toBeInTheDocument();
        expect(getReadyIndicator()).toHaveAttribute(
            'data-status',
            'completed-with-errors',
        );
        expect(mocks.useAiAgentArtifactVizQuery).toHaveBeenCalledWith(
            expect.anything(),
            { enabled: false },
        );
    });

    it('reports an errored ready indicator when the viz query fails', () => {
        mocks.useAiAgentArtifactVizQuery.mockReturnValue({
            data: undefined,
            isLoading: false,
            error: { error: { statusCode: 500 } },
        });

        renderWithProviders(<MinimalAiAgentArtifact />);

        expect(screen.queryByTestId('visualization-provider')).toBeNull();
        expect(getReadyIndicator()).toHaveAttribute(
            'data-status',
            'completed-with-errors',
        );
    });
});
