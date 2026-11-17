import { type Dashboard } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardProvider from '../../../../../providers/Dashboard/DashboardProvider';
import { renderWithProviders } from '../../../../../testing/testUtils';
import EmbedDashboard from './EmbedDashboard';

const mocks = vi.hoisted(() => ({
    availableFilters: undefined as unknown,
    embed: {} as Record<string, unknown>,
}));

vi.mock('../../../../../components/MonacoEditor', () => ({
    default: () => null,
    Editor: () => null,
    useMonaco: () => null,
}));
vi.mock('../../../../providers/Embed/useEmbed', () => ({
    default: () => mocks.embed,
}));
vi.mock(
    '../../../../../hooks/dashboard/useDashboard',
    async (importActual) => ({
        ...(await importActual<object>()),
        useDashboardQuery: () => ({
            data: undefined,
            isInitialLoading: false,
            error: null,
        }),
        useDashboardVersionRefresh: () => ({
            mutateAsync: vi.fn(),
            isLoading: false,
        }),
        useDashboardsAvailableFilters: () => ({
            data: mocks.availableFilters,
            isInitialLoading: false,
            isFetching: false,
        }),
        useUpdateDashboard: () => ({ mutate: vi.fn(), isLoading: false }),
    }),
);
vi.mock('../hooks', async (importActual) => ({
    ...(await importActual<object>()),
    useEmbedDashboard: () => ({ data: undefined, error: null }),
    useEmbedSavedParameters: () => undefined,
}));
vi.mock('../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { enabled: false },
        isInitialLoading: false,
    }),
}));
vi.mock('../../../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastWarning: vi.fn(), showToastInfo: vi.fn() }),
}));
vi.mock('../../../../../features/comments', () => ({
    useGetComments: () => ({ data: undefined }),
}));
vi.mock('../../../../../features/parameters', async (importActual) => ({
    ...(await importActual<object>()),
    useParameters: () => ({ data: undefined }),
}));
// The lock is what is under test: stand-ins for the tile and the setup modal
vi.mock('./EmbedDashboardChartTile', () => ({
    default: ({ tile }: { tile: { uuid: string } }) => (
        <i data-testid={`chart-${tile.uuid}`} />
    ),
}));
// The grid measures its width, which jsdom does not have
vi.mock('../../../../../features/dashboardTabs/ResponsiveGridLayout', () => ({
    ResponsiveGridLayout: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
    ),
}));
vi.mock('./EmbedDashboardHeader', () => ({
    default: ({ tabs }: { tabs?: React.ReactNode }) => <>{tabs}</>,
}));
vi.mock(
    '../../../../../features/dashboardFilters/FilterRequirements/GuidedFilterSetupOverlay',
    () => ({
        default: ({
            doesRuleApply,
        }: {
            doesRuleApply: (members: unknown[]) => boolean;
        }) => (
            <output data-testid="guided-setup">
                {requiredRules
                    .filter((rule) => doesRuleApply([rule]))
                    .map((rule) => rule.id)
                    .join(',')}
            </output>
        ),
    }),
);

const chartTile = (uuid: string, tabUuid: string) => ({
    uuid,
    type: 'saved_chart',
    x: 0,
    y: 0,
    w: 12,
    h: 3,
    tabUuid,
    properties: { savedChartUuid: `saved-${uuid}`, title: uuid },
});

const requiredRule = (id: string, excludedTileUuid: string) => ({
    id,
    label: id,
    operator: 'equals',
    target: { fieldId: 'orders_status', tableName: 'orders' },
    values: [],
    disabled: true,
    required: true,
    tileTargets: { [excludedTileUuid]: false },
});

const requiredRules = [requiredRule('rule-sales', 'tile-costs')];

const dashboard = {
    uuid: 'dashboard-1',
    slug: 'sales',
    name: 'Sales',
    projectUuid: 'project-1',
    spaceUuid: 'space-1',
    tiles: [
        chartTile('tile-sales', 'tab-sales'),
        chartTile('tile-costs', 'tab-costs'),
    ],
    tabs: [
        { uuid: 'tab-sales', name: 'Sales tab', order: 0 },
        { uuid: 'tab-costs', name: 'Costs tab', order: 1 },
    ],
    filters: {
        dimensions: requiredRules,
        metrics: [],
        tableCalculations: [],
    },
    parameters: {},
    config: { isDateZoomDisabled: true },
    canDateZoom: false,
    dashboardFiltersInteractivity: { enabled: 'all' },
    parameterInteractivity: { enabled: false },
} as unknown as Dashboard;

const statusField = { name: 'status', table: 'orders' };
const loadedAvailableFilters = {
    savedQueryFilters: { 'tile-sales': [0], 'tile-costs': [0] },
    savedQueryMetricFilters: {},
    allFilterableFields: [statusField],
    allFilterableMetrics: [],
};

const renderEmbed = () =>
    renderWithProviders(
        <MemoryRouter>
            <DashboardProvider
                embedToken="token"
                projectUuid="project-1"
                isEditModeExternal
            >
                <EmbedDashboard
                    initialDashboard={
                        dashboard as unknown as Parameters<
                            typeof EmbedDashboard
                        >[0]['initialDashboard']
                    }
                />
            </DashboardProvider>
        </MemoryRouter>,
    );

describe('EmbedDashboard required filters on tabs', () => {
    beforeEach(() => {
        mocks.availableFilters = loadedAvailableFilters;
        mocks.embed = {
            dashboardUuid: dashboard.uuid,
            dispatchEmbedEvent: vi.fn(),
            embedToken: 'token',
            embedWriteContext: undefined,
            languageMap: undefined,
            mode: 'sdk',
            writeActions: undefined,
            filters: undefined,
            t: () => undefined,
        };
    });

    it('locks only the tab its required filter applies to', async () => {
        renderEmbed();

        expect(
            await screen.findByTestId('unmet-requirements-placeholder'),
        ).toBeInTheDocument();
        expect(screen.getByTestId('guided-setup')).toHaveTextContent(
            'rule-sales',
        );

        await userEvent.click(screen.getByRole('tab', { name: 'Costs tab' }));

        expect(
            await screen.findByTestId('chart-tile-costs'),
        ).toBeInTheDocument();
        expect(
            screen.queryByTestId('unmet-requirements-placeholder'),
        ).toBeNull();
        expect(screen.queryByTestId('guided-setup')).toBeNull();
    });

    it('locks every tab until the tile fields load', async () => {
        mocks.availableFilters = undefined;
        renderEmbed();

        await userEvent.click(
            await screen.findByRole('tab', { name: 'Costs tab' }),
        );

        await waitFor(() =>
            expect(
                screen.getByTestId('unmet-requirements-placeholder'),
            ).toBeInTheDocument(),
        );
        expect(screen.queryByTestId('chart-tile-costs')).toBeNull();
    });
});
