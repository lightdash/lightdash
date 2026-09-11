import { Ability } from '@casl/ability';
import {
    ChartType,
    type PossibleAbilities,
    type SavedChart,
} from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import { AbilityContext } from '../../providers/Ability/context';
import { renderWithProviders } from '../../testing/testUtils';
import DashboardChartEditorModal from './DashboardChartEditorModal';

vi.mock('../../api', () => ({ lightdashApi: vi.fn() }));

// The Explorer is out of scope here; a probe exposes the store's saved chart
// so the test can see the rename reach the editing session.
vi.mock('../Explorer', async () => {
    const { selectSavedChart, useExplorerSelector } =
        await import('../../features/explorer/store');
    const StoreProbe = () => {
        const savedChart = useExplorerSelector(selectSavedChart);
        return (
            <div data-testid="store-chart">
                {savedChart?.name}|{savedChart?.description}
            </div>
        );
    };
    return { default: StoreProbe };
});

vi.mock('../Explorer/ExploreSideBar', () => ({ default: () => null }));

vi.mock('../../hooks/useExplore', () => ({
    useExplore: () => ({ data: undefined, error: null }),
}));

vi.mock('../../hooks/useExplorerQueryEffects', () => ({
    useExplorerQueryEffects: vi.fn(),
}));

vi.mock('../../hooks/dashboard/useDashboardCustomMetricSeed', () => ({
    useDashboardCustomMetricSeed: () => ({
        seededMetrics: [],
        dashboardMetricIds: new Set(),
        isLoading: false,
    }),
}));

vi.mock('../../hooks/dashboard/useUpdateDashboardCustomMetric', () => ({
    useDeleteDashboardCustomMetric: () => ({
        mutate: vi.fn(),
        isLoading: false,
    }),
}));

vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: vi.fn(),
        showToastError: vi.fn(),
        showToastApiError: vi.fn(),
    }),
}));

vi.mock('../../ee/providers/Embed/useEmbed', () => ({
    default: () => ({ projectUuid: 'project-uuid' }),
}));

const ORGANIZATION_UUID = '172a2270-000f-42be-9c68-c4752c23ae51';

const editChart = {
    uuid: 'chart-uuid',
    projectUuid: 'project-uuid',
    organizationUuid: ORGANIZATION_UUID,
    name: 'Revenue per payment method',
    description: 'Monthly revenue split by payment method',
    tableName: 'payments',
    metricQuery: {
        exploreName: 'payments',
        dimensions: ['payments_payment_method'],
        metrics: ['payments_total_revenue'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
        additionalMetrics: [],
    },
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: { xField: 'payments_payment_method', yField: [] },
            eChartsConfig: { series: [] },
        },
    },
    tableConfig: { columnOrder: [] },
    pivotConfig: undefined,
    colorPaletteUuid: 'palette-uuid',
} as unknown as SavedChart;

const manageChartAbility = new Ability<PossibleAbilities>([
    {
        action: 'manage',
        subject: 'SavedChart',
        conditions: { organizationUuid: ORGANIZATION_UUID },
    },
]);
const viewOnlyAbility = new Ability<PossibleAbilities>([]);

const renderModal = (
    ability: Ability<PossibleAbilities>,
    chart: SavedChart = editChart,
) => {
    const onClose = vi.fn();
    renderWithProviders(
        <MemoryRouter>
            <AbilityContext.Provider value={ability}>
                <DashboardChartEditorModal
                    opened
                    dashboard={{ uuid: 'dashboard-uuid', name: 'Payments' }}
                    editChart={chart}
                    customMetricsEnabled={false}
                    onChartSaved={vi.fn()}
                    onRegistryMetricEdited={vi.fn()}
                    onRegistryMetricDeleted={vi.fn()}
                    onClose={onClose}
                />
            </AbilityContext.Provider>
        </MemoryRouter>,
    );
    return { onClose };
};

describe('DashboardChartEditorModal rename', () => {
    let chartOnServer: SavedChart;

    beforeEach(() => {
        chartOnServer = editChart;
        vi.mocked(lightdashApi).mockImplementation((async ({
            url,
            method,
            body,
        }) => {
            if (
                method === 'GET' &&
                url === '/projects/project-uuid/saved/chart-uuid'
            ) {
                return chartOnServer;
            }
            if (method === 'PATCH' && url === '/saved/chart-uuid') {
                const patch = JSON.parse(body as string) as Pick<
                    SavedChart,
                    'name' | 'description'
                >;
                chartOnServer = {
                    ...chartOnServer,
                    name: patch.name,
                    description: patch.description,
                };
                return chartOnServer;
            }
            return new Promise(() => {});
        }) as typeof lightdashApi);
    });

    it('renames the chart and edits its description without leaving the editor', async () => {
        const user = userEvent.setup();
        const { onClose } = renderModal(manageChartAbility);

        expect(
            await screen.findByText('Edit Revenue per payment method'),
        ).toBeVisible();

        await user.click(
            screen.getByRole('button', { name: 'Edit name and description' }),
        );

        const nameInput = await screen.findByLabelText(/Chart name/);
        await waitFor(() =>
            expect(nameInput).toHaveValue('Revenue per payment method'),
        );
        await user.clear(nameInput);
        await user.type(nameInput, 'Revenue by payment method');

        const descriptionInput = screen.getByLabelText('Chart description');
        await user.clear(descriptionInput);
        await user.type(descriptionInput, 'Renamed from the dashboard');

        await user.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: 'PATCH',
                    url: '/saved/chart-uuid',
                    body: expect.stringContaining(
                        '"name":"Revenue by payment method"',
                    ),
                }),
            ),
        );

        expect(
            await screen.findByText('Edit Revenue by payment method'),
        ).toBeVisible();
        await waitFor(() =>
            expect(screen.getByTestId('store-chart')).toHaveTextContent(
                'Revenue by payment method|Renamed from the dashboard',
            ),
        );
        expect(onClose).not.toHaveBeenCalled();
    });

    it('hides the rename control on a verified chart the user may not mutate', async () => {
        renderModal(manageChartAbility, {
            ...editChart,
            verification: {
                verifiedBy: {
                    userUuid: 'someone-else',
                    firstName: 'Ada',
                    lastName: 'Lovelace',
                },
                verifiedAt: new Date('2026-09-01T00:00:00Z'),
            },
        });

        expect(
            await screen.findByText('Edit Revenue per payment method'),
        ).toBeVisible();
        expect(
            screen.queryByRole('button', { name: 'Edit name and description' }),
        ).toBeNull();
    });

    it('hides the rename control when the user cannot manage the chart', async () => {
        renderModal(viewOnlyAbility);

        expect(
            await screen.findByText('Edit Revenue per payment method'),
        ).toBeVisible();
        expect(
            screen.queryByRole('button', { name: 'Edit name and description' }),
        ).toBeNull();
    });
});
