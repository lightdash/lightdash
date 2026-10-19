import { screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createExplorerStore,
    explorerActions,
} from '../../features/explorer/store';
import { renderWithProviders } from '../../testing/testUtils';
import Explorer from './index';

const { cardProps, sqlCardProps, exploreBinding } = vi.hoisted(() => ({
    cardProps: [] as { renderVisualization: boolean }[],
    sqlCardProps: [] as {
        warehouseConnectionUuid: string | null | undefined;
    }[],
    exploreBinding: { value: undefined as string | null | undefined },
}));

vi.mock('./VisualizationCard/VisualizationCard', () => ({
    default: (props: { renderVisualization: boolean }) => {
        cardProps.push(props);
        return <div data-testid="visualization-card" />;
    },
}));
vi.mock('./ExplorerHeader', () => ({
    default: () => <div data-testid="explorer-header" />,
}));
vi.mock('./ResultsCard/ResultsCard', () => ({
    default: () => <div data-testid="results-card" />,
}));
vi.mock('./SqlCard/SqlCard', () => ({
    default: (props: {
        warehouseConnectionUuid: string | null | undefined;
    }) => {
        sqlCardProps.push(props);
        return null;
    },
}));
vi.mock('./FiltersCard/FiltersCard', () => ({
    default: () => <div data-testid="filters-card" />,
}));
vi.mock('./ParametersCard/ParametersCard', () => ({ default: () => null }));
vi.mock('../RefreshDbtButton', () => ({ default: () => null }));
vi.mock('../common/ScreenshotReadyIndicator', () => ({ default: () => null }));
vi.mock('../MetricQueryData/MetricQueryDataProvider', () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../MetricQueryData/UnderlyingDataModal', () => ({
    default: () => null,
}));
vi.mock('../MetricQueryData/DrillDownModal', () => ({
    DrillDownModal: () => null,
}));
vi.mock('./CustomDimensionModal', () => ({ CustomDimensionModal: () => null }));
vi.mock('./CustomMetricModal', () => ({ CustomMetricModal: () => null }));
vi.mock('./FormatModal', () => ({ FormatModal: () => null }));
vi.mock('./WriteBackModal', () => ({ WriteBackModal: () => null }));
vi.mock(
    './PeriodOverPeriodComparisonModal/PeriodOverPeriodComparisonModal',
    () => ({
        PeriodOverPeriodComparisonModal: () => null,
    }),
);
vi.mock('../../features/mergeQuery/components/MergeAutoRun', () => ({
    MergeAutoRun: () => <div data-testid="merge-auto-run" />,
}));
vi.mock('../../features/mergeQuery/components/MergeReadOnlyBar', () => ({
    MergeReadOnlyBar: () => null,
}));
vi.mock('../../features/mergeQuery/components/MergeRelationshipCard', () => ({
    MergeRelationshipCard: () => null,
}));
vi.mock('../../hooks/useExplore', () => ({
    useExplore: () => ({
        data:
            exploreBinding.value === undefined
                ? undefined
                : {
                      warehouseConnectionUuid: exploreBinding.value,
                      tables: {},
                      joinedTables: [],
                  },
    }),
}));
vi.mock('../../hooks/useCompiledSql', () => ({
    useCompiledSql: () => ({ data: undefined }),
}));
vi.mock('../../hooks/useDefaultSortField', () => ({
    default: () => undefined,
}));
vi.mock('../../hooks/parameters/useParameters', () => ({
    useParameters: () => ({ data: undefined }),
}));
vi.mock('../../hooks/organization/useOrganization', () => ({
    useOrganization: () => ({
        data: { organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51' },
    }),
}));
vi.mock('../../hooks/useExplorerQuery', () => ({
    useExplorerQuery: () => ({
        query: { data: undefined, error: null },
        queryResults: { error: null },
    }),
}));
vi.mock('../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-1',
}));
vi.mock('../../providers/Fullscreen/useFullscreen', () => ({
    default: () => ({ isFullscreen: false }),
}));
vi.mock('../../providers/Ability', () => ({
    Can: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const renderExplorer = ({ authoring = false } = {}) => {
    const store = createExplorerStore();
    store.dispatch(explorerActions.setIsEditMode(true));
    if (authoring) {
        store.dispatch(
            explorerActions.startChartTypeAuthoring({ dataAppVizUuid: null }),
        );
    }
    cardProps.length = 0;
    sqlCardProps.length = 0;
    renderWithProviders(
        <Provider store={store}>
            <MemoryRouter>
                <Explorer />
            </MemoryRouter>
        </Provider>,
    );
};

describe('Explorer while a chart type is authored', () => {
    beforeEach(() => {
        exploreBinding.value = undefined;
    });

    it('passes the bound explore connection to the SQL card', () => {
        exploreBinding.value = 'finance-uuid';
        renderExplorer();

        expect(sqlCardProps.at(-1)?.warehouseConnectionUuid).toBe(
            'finance-uuid',
        );
    });
    it('shows the chart and its cards when nothing is authored', () => {
        renderExplorer();

        expect(screen.getByTestId('explorer-header')).toBeInTheDocument();
        expect(screen.getByTestId('results-card')).toBeInTheDocument();
        expect(
            screen.queryByTestId('chart-type-authoring'),
        ).not.toBeInTheDocument();
        expect(cardProps.at(-1)?.renderVisualization).toBe(true);
    });

    it('keeps the page as-is behind the builder modal and pauses the chart', () => {
        renderExplorer({ authoring: true });

        // The modal opens over an unchanged page; the card hosts the modal
        // itself (covered by its own tests) and only pauses the chart render.
        expect(screen.getByTestId('explorer-header')).toBeInTheDocument();
        expect(screen.getByTestId('results-card')).toBeInTheDocument();
        expect(screen.getByTestId('filters-card')).toBeInTheDocument();
        expect(screen.getByTestId('merge-auto-run')).toBeInTheDocument();
        expect(screen.getByTestId('visualization-card')).toBeVisible();
        expect(cardProps.at(-1)?.renderVisualization).toBe(false);
    });
});
