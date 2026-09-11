import { Ability } from '@casl/ability';
import { type PossibleAbilities, type SavedChart } from '@lightdash/common';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import { parseChartFromExplorerSearchParams } from '../../hooks/useExplorerRoute';
import { AbilityContext } from '../../providers/Ability/context';
import {
    manageChartRule,
    mockSavedChartResponse,
} from '../../testing/savedChartResponse.mock';
import { renderWithProviders } from '../../testing/testUtils';
import { DashboardChartEditorActionsPortalId } from './constants';
import DashboardChartEditorModal from './DashboardChartEditorModal';

vi.mock('../../api', () => ({ lightdashApi: vi.fn() }));

// The Explorer is out of scope here; a probe exposes the store's saved chart
// so the test can see the rename reach the editing session, and stands in for
// the user editing the query.
vi.mock('../Explorer', async () => {
    const {
        explorerActions,
        selectSavedChart,
        useExplorerDispatch,
        useExplorerSelector,
    } = await import('../../features/explorer/store');
    const StoreProbe = () => {
        const savedChart = useExplorerSelector(selectSavedChart);
        const dispatch = useExplorerDispatch();
        return (
            <div data-testid="store-chart">
                {savedChart?.name}|{savedChart?.description}
                <button
                    type="button"
                    onClick={() => dispatch(explorerActions.setRowLimit(25))}
                >
                    Edit the query
                </button>
            </div>
        );
    };
    return { default: StoreProbe };
});

vi.mock('../Explorer/ExploreSideBar', () => ({ default: () => null }));

vi.mock('../../hooks/useExplore', () => ({
    useExplore: () => ({ data: undefined, error: null }),
    useExploreByProjectUuid: () => ({ data: undefined, error: null }),
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

// The AI entry point resolves agents through its own providers; not under test.
vi.mock(
    '../../ee/features/aiCopilot/components/AskAiAgentMenuItem/AskAiAgentMenuItem',
    () => ({ AskAiAgentMenuItem: () => null }),
);

vi.mock('../../hooks/useProjectRoute', () => ({
    useOptionalProjectRoute: () => undefined,
    useProjectUrlIdentifier: () => 'project-uuid',
}));

const editChart = mockSavedChartResponse({
    description: 'Monthly revenue split by payment method',
});

const manageChartAbility = new Ability<PossibleAbilities>([manageChartRule]);
const viewOnlyAbility = new Ability<PossibleAbilities>([]);

// Stands in for the chart page so the exit from the editor can be asserted.
const ChartPageProbe = () => {
    const location = useLocation();
    return (
        <div data-testid="chart-page">
            {location.pathname}
            {location.search}
        </div>
    );
};

// The header gate reads the ability context; the actions menu reads the app
// user, so both carry the same rules.
const renderModal = (
    ability: Ability<PossibleAbilities>,
    chart: SavedChart = editChart,
) => {
    const onClose = vi.fn();
    const onBeforeOpenChartPage = vi.fn();
    renderWithProviders(
        <MemoryRouter initialEntries={['/dashboard']}>
            <AbilityContext.Provider value={ability}>
                <Routes>
                    <Route
                        path="/dashboard"
                        element={
                            <DashboardChartEditorModal
                                opened
                                dashboard={{
                                    uuid: 'dashboard-uuid',
                                    name: 'Payments',
                                }}
                                editChart={chart}
                                customMetricsEnabled={false}
                                onBeforeOpenChartPage={onBeforeOpenChartPage}
                                onChartSaved={vi.fn()}
                                onRegistryMetricEdited={vi.fn()}
                                onRegistryMetricDeleted={vi.fn()}
                                onClose={onClose}
                            />
                        }
                    />
                    <Route
                        path="/projects/:projectUuid/saved/:slug/edit"
                        element={<ChartPageProbe />}
                    />
                </Routes>
            </AbilityContext.Provider>
        </MemoryRouter>,
        { user: { abilityRules: ability.rules } },
    );
    return { onClose, onBeforeOpenChartPage };
};

describe('DashboardChartEditorModal header', () => {
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
            await screen.findByText('Revenue per payment method'),
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
            await screen.findByText('Revenue by payment method'),
        ).toBeVisible();
        await waitFor(() =>
            expect(screen.getByTestId('store-chart')).toHaveTextContent(
                'Revenue by payment method|Renamed from the dashboard',
            ),
        );
        expect(onClose).not.toHaveBeenCalled();
    });

    it('puts Save, Cancel and the chart actions in the header, and Cancel closes the editor', async () => {
        const user = userEvent.setup();
        const { onClose } = renderModal(manageChartAbility);

        const actions = await screen.findByRole('button', {
            name: 'Chart actions',
        });
        const slot = document.getElementById(
            DashboardChartEditorActionsPortalId,
        );
        expect(slot).not.toBeNull();
        expect(slot).toContainElement(actions);
        expect(
            within(slot!).getByRole('button', { name: 'Save changes' }),
        ).toBeVisible();

        await user.click(within(slot!).getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('asks before discarding unsaved edits when Cancel closes the editor', async () => {
        const user = userEvent.setup();
        const { onClose } = renderModal(manageChartAbility);

        await user.click(
            await screen.findByRole('button', { name: 'Edit the query' }),
        );

        const cancel = () =>
            user.click(
                within(
                    document.getElementById(
                        DashboardChartEditorActionsPortalId,
                    )!,
                ).getByRole('button', { name: 'Cancel' }),
            );

        await cancel();
        const confirmation = await screen.findByRole('dialog', {
            name: 'Unsaved changes',
        });
        await user.click(
            within(confirmation).getByRole('button', { name: 'Keep editing' }),
        );
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByTestId('store-chart')).toBeVisible();

        await cancel();
        await user.click(
            within(
                await screen.findByRole('dialog', { name: 'Unsaved changes' }),
            ).getByRole('button', { name: 'Discard changes' }),
        );
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('opens the chart page in place from the header, carrying the unsaved edits and the dashboard', async () => {
        const user = userEvent.setup();
        const { onClose, onBeforeOpenChartPage } =
            renderModal(manageChartAbility);

        await user.click(
            await screen.findByRole('button', { name: 'Edit the query' }),
        );
        await user.click(
            screen.getByRole('button', { name: 'Open chart page' }),
        );

        const destination = new URL(
            (await screen.findByTestId('chart-page')).textContent ?? '',
            'http://lightdash.local',
        );
        expect(destination.pathname).toBe(
            '/projects/project-uuid/saved/revenue-per-payment-method/edit',
        );
        expect(destination.searchParams.get('fromDashboard')).toBe(
            'dashboard-uuid',
        );
        const carriedChart = parseChartFromExplorerSearchParams(
            destination.search,
        );
        expect(carriedChart?.tableName).toBe('payments');
        expect(carriedChart?.metricQuery.limit).toBe(25);
        expect(carriedChart?.metricQuery.dimensions).toEqual([
            'payments_payment_method',
        ]);
        // Unsaved edits travel with the url, so nothing is discarded.
        expect(screen.queryByText('Unsaved changes')).toBeNull();
        expect(onBeforeOpenChartPage).toHaveBeenCalledTimes(1);
        // The route change unmounts the host; closing it first would let
        // the dashboard's URL sync replace the navigation.
        expect(onClose).not.toHaveBeenCalled();
    });

    it('opens version history in place from the actions menu', async () => {
        const user = userEvent.setup();
        renderModal(manageChartAbility);

        await user.click(
            await screen.findByRole('button', { name: 'Chart actions' }),
        );
        expect(await screen.findByText('Version history')).toBeVisible();
        expect(screen.queryByText('Move to space')).toBeNull();
        expect(screen.queryByText('Ask AI Agent')).toBeNull();

        await user.click(screen.getByText('Version history'));

        expect(
            await screen.findByRole('dialog', { name: 'Version history' }),
        ).toBeVisible();
        expect(
            screen.queryByRole('link', { name: 'Version history' }),
        ).toBeNull();
    });

    it('hides the rename control and the actions menu on a verified chart the user may not mutate', async () => {
        const verifiedChart: SavedChart = {
            ...editChart,
            verification: {
                verifiedBy: {
                    userUuid: 'someone-else',
                    firstName: 'Ada',
                    lastName: 'Lovelace',
                },
                verifiedAt: new Date('2026-09-01T00:00:00Z'),
            },
        };
        chartOnServer = verifiedChart;
        renderModal(manageChartAbility, verifiedChart);

        expect(
            await screen.findByText('Revenue per payment method'),
        ).toBeVisible();
        expect(
            screen.queryByRole('button', { name: 'Edit name and description' }),
        ).toBeNull();
        expect(
            screen.queryByRole('button', { name: 'Chart actions' }),
        ).toBeNull();
    });

    it('hides the rename control and the actions menu when the user cannot manage the chart', async () => {
        renderModal(viewOnlyAbility);

        expect(
            await screen.findByText('Revenue per payment method'),
        ).toBeVisible();
        expect(
            screen.queryByRole('button', { name: 'Edit name and description' }),
        ).toBeNull();
        expect(
            screen.queryByRole('button', { name: 'Chart actions' }),
        ).toBeNull();
    });
});
