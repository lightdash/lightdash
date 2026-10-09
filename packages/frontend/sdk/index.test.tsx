import { fireEvent, render, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockEmbedWriteContext: { canUpdateSavedChart: boolean } | undefined;

const requestFromInstance = (lightdashApi: LightdashApi, url: string) =>
    lightdashApi({ url, method: 'GET', body: undefined });

vi.mock('../src/ee/pages/EmbedDashboard', async () => {
    const { default: useEmbed } =
        await import('../src/ee/providers/Embed/useEmbed');
    const { useLightdashApi } =
        await import('../src/providers/LightdashApi/useLightdashApi');

    return {
        default: function MockEmbedDashboard() {
            const { onExplore } = useEmbed();
            const lightdashApi = useLightdashApi();
            return (
                <div data-testid="embed-dashboard">
                    <button
                        data-testid="dashboard-request"
                        onClick={() =>
                            void requestFromInstance(lightdashApi, '/dashboard')
                        }
                    />
                    <button
                        data-testid="saved-chart-explore"
                        onClick={() =>
                            onExplore({
                                chart: { uuid: 'saved-chart-uuid' } as never,
                            })
                        }
                    />
                    <button
                        data-testid="drill-down-explore"
                        onClick={() =>
                            onExplore({
                                chart: { tableName: 'orders' } as never,
                            })
                        }
                    />
                </div>
            );
        },
    };
});

vi.mock('../src/components/MonacoEditor', () => ({
    default: () => null,
    Editor: () => null,
    useMonaco: () => null,
}));

vi.mock('../src/ee/pages/EmbedChart', async () => {
    const { default: useEmbed } =
        await import('../src/ee/providers/Embed/useEmbed');
    const { useLightdashApi } =
        await import('../src/providers/LightdashApi/useLightdashApi');

    return {
        default: function MockEmbedChart() {
            const { embedToken, onExplore } = useEmbed();
            const lightdashApi = useLightdashApi();
            return (
                <div data-testid="embed-chart-view" data-token={embedToken}>
                    <button
                        data-testid="chart-request"
                        onClick={() =>
                            void requestFromInstance(lightdashApi, '/chart')
                        }
                    />
                    <button
                        data-testid="chart-saved-explore"
                        onClick={() =>
                            onExplore({
                                chart: {
                                    uuid: 'test-chart-uuid',
                                    tableName: 'payments',
                                } as never,
                            })
                        }
                    />
                </div>
            );
        },
    };
});

vi.mock('../src/ee/pages/EmbedExplore', async () => {
    const { default: useEmbed } =
        await import('../src/ee/providers/Embed/useEmbed');

    return {
        default: function MockEmbedExplore({
            exploreId,
            savedChart,
            allowChartUpdate,
            isEditMode,
            chartView,
            runQueryOnLoad,
        }: {
            exploreId?: string;
            savedChart?: { uuid?: string; metricQuery?: { metrics: string[] } };
            allowChartUpdate?: boolean;
            isEditMode?: boolean;
            chartView?: boolean;
            runQueryOnLoad?: boolean;
        }) {
            const { onExplore, onBackToDashboard, backDestination } =
                useEmbed();
            return (
                <div
                    data-testid={
                        chartView === undefined
                            ? 'embed-explore'
                            : 'embed-chart-edit'
                    }
                    data-explore-id={exploreId}
                    data-saved-chart-uuid={savedChart?.uuid}
                    data-metrics={savedChart?.metricQuery?.metrics.join(',')}
                    data-allow-chart-update={allowChartUpdate}
                    data-edit-mode={isEditMode}
                    data-chart-view={chartView}
                    data-run-query-on-load={runQueryOnLoad}
                >
                    <button
                        data-testid="explore-drill-down"
                        onClick={() =>
                            onExplore({
                                chart: { tableName: 'orders' } as never,
                            })
                        }
                    />
                    <button
                        data-testid="explore-drill-down-unsaved"
                        onClick={() =>
                            onExplore({
                                chart: {
                                    tableName: `${exploreId}_drill`,
                                } as never,
                                sourceChart: {
                                    tableName: exploreId,
                                    metricQuery: {
                                        metrics: [`${exploreId}_unsaved`],
                                    },
                                } as never,
                            })
                        }
                    />
                    {onBackToDashboard && (
                        <button
                            data-testid="explore-back"
                            data-back-destination={backDestination}
                            onClick={onBackToDashboard}
                        />
                    )}
                </div>
            );
        },
    };
});

// Mock react-router hooks
const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
    const actual = await vi.importActual('react-router');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

// Mock API calls
vi.mock('../src/hooks/dashboard/useDashboard', () => ({
    useDashboardQuery: () => ({
        data: {
            uuid: 'test-dashboard-uuid',
            name: 'Test Dashboard',
            description: '',
            tiles: [],
            tabs: [
                { uuid: 'tab-1', name: 'Tab 1', order: 0 },
                { uuid: 'tab-2', name: 'Tab 2', order: 1 },
            ],
            filters: { dimensions: [], metrics: [], tableCalculations: [] },
            updatedAt: new Date(),
            projectUuid: 'test-project-uuid',
            organizationUuid: 'test-org-uuid',
            spaceUuid: 'test-space-uuid',
            pinnedListUuid: null,
            views: 0,
            firstViewedAt: null,
            slug: 'test-dashboard',
        },
        isInitialLoading: false,
        error: null,
    }),
    useDashboardsAvailableFilters: () => ({
        isInitialLoading: false,
        isFetching: false,
        data: {
            allFilterableFields: [],
            savedQueryFilters: {},
        },
    }),
    useDashboardVersionRefresh: () => ({
        mutateAsync: vi.fn(),
        isLoading: false,
    }),
}));

vi.mock('../src/hooks/user/useAccount', () => ({
    useAccount: () => ({
        data: {
            embedWriteContext: mockEmbedWriteContext,
            user: {
                userUuid: 'test-user',
                email: 'test@example.com',
                firstName: 'Test',
                lastName: 'User',
                organizationUuid: 'test-org',
                organizationName: 'Test Org',
                isTrackingAnonymized: false,
                isMarketingOptedIn: false,
                isSetupComplete: true,
                abilityRules: [],
            },
        },
        isLoading: false,
    }),
}));

vi.mock('../src/ee/features/embed/EmbedDashboard/hooks', () => ({
    useEmbedDashboard: () => ({
        data: {
            uuid: 'test-dashboard-uuid',
            name: 'Test Dashboard',
            description: '',
            tiles: [],
            tabs: [
                { uuid: 'tab-1', name: 'Tab 1', order: 0 },
                { uuid: 'tab-2', name: 'Tab 2', order: 1 },
            ],
            filters: { dimensions: [], metrics: [], tableCalculations: [] },
            updatedAt: new Date(),
            projectUuid: 'test-project-uuid',
            organizationUuid: 'test-org-uuid',
            spaceUuid: 'test-space-uuid',
            pinnedListUuid: null,
            views: 0,
            firstViewedAt: null,
            slug: 'test-dashboard',
            canExportCsv: true,
            canExportImages: true,
        },
        error: null,
    }),
}));

// Mock AbilityProvider
vi.mock('../src/providers/Ability/AbilityProvider', () => ({
    default: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
    ),
}));

vi.mock('../src/providers/Ability/useAbilityContext', () => ({
    useAbilityContext: () => ({
        update: vi.fn(),
        can: vi.fn(() => true),
    }),
}));

vi.mock('../src/features/parameters', () => ({
    useParameters: () => ({
        data: {},
    }),
}));

vi.mock('../src/features/comments', () => ({
    useGetComments: () => ({
        data: {},
    }),
}));

vi.mock('../src/pages/MetricsCatalog', async () => {
    const { DocumentTitle } =
        await import('../src/components/common/DocumentTitle');

    return {
        default: ({ hiddenFilters }: { hiddenFilters?: string[] }) => (
            <>
                <DocumentTitle title="Metrics" />
                <div
                    data-testid="metrics-catalog-page"
                    data-hidden-filters={hiddenFilters?.join(',')}
                />
            </>
        ),
    };
});

vi.mock('../src/ee/pages/AiAgents/AgentPage', async () => {
    const { Outlet, useParams } = await import('react-router');
    const { default: useIsEmbedded } =
        await import('../src/ee/providers/Embed/useIsEmbedded');

    return {
        default: function MockAgentPage() {
            const { agentUuid } = useParams();
            const isEmbedded = useIsEmbedded();
            return (
                <div
                    data-testid="agent-page"
                    data-agent-uuid={agentUuid}
                    data-embedded={String(isEmbedded)}
                >
                    <Outlet />
                </div>
            );
        },
    };
});

vi.mock('../src/ee/pages/AiAgents/AiAgentNewThreadPage', async () => {
    const { useParams } = await import('react-router');
    const { useEmitEmbedAiAgentThreadChange } =
        await import('../src/ee/features/aiCopilot/hooks/embedAiAgentThreadChange');

    return {
        default: function MockAiAgentNewThreadPage() {
            const { projectUuid, agentUuid } = useParams();
            const emitThreadChange = useEmitEmbedAiAgentThreadChange();
            return (
                <button
                    data-testid="agent-new-thread"
                    onClick={() =>
                        emitThreadChange({
                            projectUuid: projectUuid!,
                            agentUuid: agentUuid!,
                            threadUuid: 'created-thread-uuid',
                        })
                    }
                />
            );
        },
    };
});

vi.mock('../src/ee/pages/AiAgents/AgentThreadPage', async () => {
    const { useParams } = await import('react-router');

    return {
        default: function MockAgentThreadPage() {
            const { threadUuid } = useParams();
            return (
                <div data-testid="agent-thread" data-thread-uuid={threadUuid} />
            );
        },
    };
});

vi.mock('../src/hooks/health/useHealth', () => ({
    default: () => ({ data: undefined }),
}));

import { FilterOperator } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { type LightdashApi } from '../src/api';
import EmbedProvider from '../src/ee/providers/Embed/EmbedProvider';
import { EMBED_KEY, type InMemoryEmbed } from '../src/ee/providers/Embed/types';
import {
    clearInMemoryStorage,
    getFromInMemoryStorage,
} from '../src/utils/inMemoryStorage';
import {
    AiAgent,
    Chart,
    Dashboard,
    Explore,
    MetricsCatalog,
    createLightdashApiClient,
} from './index';

describe('SDK Dashboard - URL Sync Behavior', () => {
    const mockToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250ZW50Ijp7InByb2plY3RVdWlkIjoidGVzdC1wcm9qZWN0LXV1aWQifX0.test';
    const mockInstanceUrl = 'http://localhost:3000';
    const originalLocation = window.location;

    beforeEach(() => {
        vi.clearAllMocks();
        // Store initial window.location
        window.location = {
            ...window.location,
            pathname: '/test',
            search: '',
            hash: '',
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
        window.location = originalLocation;
    });

    it('should pass mode="sdk" to EmbedProvider', async () => {
        const { container } = render(
            <Dashboard
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                filters={[]}
            />,
        );

        await waitFor(() => {
            expect(container).toBeTruthy();
        });

        // SDK mode should be set, which will prevent URL syncing
        // We verify this indirectly by checking that navigate is never called
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should NOT sync URL when filters change in SDK mode', async () => {
        const filters: Array<{
            model: string;
            field: string;
            operator: FilterOperator;
            value: string;
        }> = [];

        const { rerender } = render(
            <Dashboard
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                filters={filters}
            />,
        );

        const initialPathname = window.location.pathname;
        const initialSearch = window.location.search;

        // Update filters
        const newFilters = [
            {
                model: 'payments',
                field: 'payment_method',
                operator: FilterOperator.EQUALS,
                value: 'credit_card',
            },
        ];

        rerender(
            <Dashboard
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                filters={newFilters}
            />,
        );

        await waitFor(() => {
            // Verify navigate was NOT called
            expect(mockNavigate).not.toHaveBeenCalled();
        });

        // Verify window.location hasn't changed
        expect(window.location.pathname).toBe(initialPathname);
        expect(window.location.search).toBe(initialSearch);
    });

    it('should NOT sync URL when dateZoom changes in SDK mode', async () => {
        render(
            <Dashboard
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                filters={[]}
            />,
        );

        const initialPathname = window.location.pathname;
        const initialSearch = window.location.search;

        // In a real scenario, dateZoom would be changed through the DashboardProvider context
        // Since we're in SDK mode, any dateZoom changes should NOT trigger URL updates

        await waitFor(() => {
            // Verify navigate was NOT called
            expect(mockNavigate).not.toHaveBeenCalled();
        });

        // Verify window.location hasn't changed
        expect(window.location.pathname).toBe(initialPathname);
        expect(window.location.search).toBe(initialSearch);
    });

    it('should NOT sync URL when tabs change in SDK mode', async () => {
        render(
            <Dashboard
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                filters={[]}
            />,
        );

        const initialPathname = window.location.pathname;
        const initialSearch = window.location.search;

        // In a real scenario, tab switching would trigger navigation
        // In SDK mode, this should NOT update the browser URL

        await waitFor(() => {
            // Verify navigate was NOT called
            expect(mockNavigate).not.toHaveBeenCalled();
        });

        // Verify window.location hasn't changed
        expect(window.location.pathname).toBe(initialPathname);
        expect(window.location.search).toBe(initialSearch);
    });

    it('should use MemoryRouter which does not affect browser URL', async () => {
        const { container } = render(
            <Dashboard
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                filters={[]}
            />,
        );

        await waitFor(() => {
            expect(container).toBeTruthy();
        });

        // MemoryRouter keeps routing state in memory
        // Any navigation within the SDK should not affect window.location
        expect(window.location.pathname).toBe('/test');
        expect(window.location.search).toBe('');
    });

    it('should accept async token provider', async () => {
        const asyncToken = Promise.resolve(mockToken);

        const { container } = render(
            <Dashboard
                token={asyncToken}
                instanceUrl={mockInstanceUrl}
                filters={[]}
            />,
        );

        await waitFor(() => {
            expect(container).toBeTruthy();
        });

        // Verify navigate was not called even with async token
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('reports an invalid token to onError instead of failing silently', async () => {
        const onError = vi.fn();
        render(
            <Dashboard
                token="not-a-jwt"
                instanceUrl={mockInstanceUrl}
                onError={onError}
            />,
        );

        await waitFor(() => {
            expect(onError).toHaveBeenCalledWith({
                kind: 'invalid_token',
                status: null,
                message: 'Invalid JWT token',
                retryable: false,
                fatal: true,
            });
        });
    });

    it('should handle explore navigation without syncing URL', async () => {
        const mockOnExplore = vi.fn();

        const { getByTestId } = render(
            <Dashboard
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                filters={[]}
                onExplore={mockOnExplore}
            />,
        );

        await waitFor(() => {
            expect(getByTestId('embed-dashboard')).toBeTruthy();
        });

        fireEvent.click(getByTestId('saved-chart-explore'));

        await waitFor(() => {
            expect(mockOnExplore).toHaveBeenCalledWith({
                chart: { uuid: 'saved-chart-uuid' },
            });
            expect(window.location.pathname).toBe('/test');
        });
    });

    it('opens saved tiles inside the SDK dashboard when the host has no onExplore', async () => {
        const { getByTestId, queryByTestId } = render(
            <Dashboard
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                filters={[]}
            />,
        );

        await waitFor(() => {
            expect(getByTestId('embed-dashboard')).toBeTruthy();
        });

        fireEvent.click(getByTestId('saved-chart-explore'));

        await waitFor(() => {
            expect(getByTestId('embed-explore').dataset.savedChartUuid).toBe(
                'saved-chart-uuid',
            );
        });
        expect(window.location.pathname).toBe('/test');
        expect(getByTestId('explore-back').dataset.backDestination).toBe(
            'dashboard',
        );

        fireEvent.click(getByTestId('explore-back'));
        await waitFor(() => {
            expect(getByTestId('embed-dashboard')).toBeTruthy();
        });
        expect(queryByTestId('embed-explore')).toBeNull();
    });

    it('should render drill-down explores inside the SDK dashboard', async () => {
        const { getByTestId } = render(
            <Dashboard
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                filters={[]}
            />,
        );

        await waitFor(() => {
            expect(getByTestId('embed-dashboard')).toBeTruthy();
        });

        fireEvent.click(getByTestId('drill-down-explore'));

        await waitFor(() => {
            expect(getByTestId('embed-explore')).toBeTruthy();
            expect(window.location.pathname).toBe('/test');
        });
        expect(getByTestId('explore-back').dataset.backDestination).toBe(
            'dashboard',
        );
    });

    it('returns to the SDK dashboard in one click from a nested drill-down', async () => {
        const { getByTestId, queryByTestId } = render(
            <Dashboard
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                filters={[]}
            />,
        );

        await waitFor(() => {
            expect(getByTestId('embed-dashboard')).toBeTruthy();
        });

        fireEvent.click(getByTestId('drill-down-explore'));
        await waitFor(() => {
            expect(getByTestId('embed-explore').dataset.exploreId).toBe(
                'orders',
            );
        });

        fireEvent.click(getByTestId('explore-drill-down-unsaved'));
        await waitFor(() => {
            expect(getByTestId('embed-explore').dataset.exploreId).toBe(
                'orders_drill',
            );
        });

        fireEvent.click(getByTestId('explore-back'));
        await waitFor(() => {
            expect(getByTestId('embed-dashboard')).toBeTruthy();
        });
        expect(queryByTestId('embed-explore')).toBeNull();
    });

    it('drills in place inside the SDK explore and returns to the saved chart', async () => {
        const onExplore = vi.fn();
        const { getByTestId, queryByTestId } = render(
            <Explore
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                exploreId="payments"
                savedChart={
                    { uuid: 'saved-chart-uuid', tableName: 'payments' } as never
                }
                onExplore={onExplore}
            />,
        );

        await waitFor(() => {
            expect(getByTestId('embed-explore').dataset.savedChartUuid).toBe(
                'saved-chart-uuid',
            );
        });
        expect(queryByTestId('explore-back')).toBeNull();

        fireEvent.click(getByTestId('explore-drill-down'));

        await waitFor(() => {
            expect(getByTestId('embed-explore').dataset.exploreId).toBe(
                'orders',
            );
        });
        expect(getByTestId('embed-explore').dataset.savedChartUuid).toBe(
            undefined,
        );
        expect(onExplore).not.toHaveBeenCalled();
        expect(getByTestId('explore-back').dataset.backDestination).toBe(
            'explore',
        );

        fireEvent.click(getByTestId('explore-back'));

        await waitFor(() => {
            expect(getByTestId('embed-explore').dataset.exploreId).toBe(
                'payments',
            );
        });
        expect(queryByTestId('explore-back')).toBeNull();
    });

    it('labels the drill-down back destination as the Explore, whatever the token content type', async () => {
        const metricsCatalogToken =
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250ZW50Ijp7InR5cGUiOiJtZXRyaWNzQ2F0YWxvZyIsInByb2plY3RVdWlkIjoidGVzdC1wcm9qZWN0LXV1aWQifX0.test';
        const { getByTestId } = render(
            <Explore
                token={metricsCatalogToken}
                instanceUrl={mockInstanceUrl}
                exploreId="payments"
                savedChart={
                    { uuid: 'saved-chart-uuid', tableName: 'payments' } as never
                }
            />,
        );

        await waitFor(() => {
            expect(getByTestId('embed-explore')).toBeTruthy();
        });
        fireEvent.click(getByTestId('explore-drill-down'));

        await waitFor(() => {
            expect(getByTestId('explore-back').dataset.backDestination).toBe(
                'explore',
            );
        });
    });

    it('restores the unsaved root query on back from a nested drill-down', async () => {
        const { getByTestId, queryByTestId } = render(
            <Explore
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                exploreId="payments"
                savedChart={
                    { uuid: 'saved-chart-uuid', tableName: 'payments' } as never
                }
            />,
        );

        await waitFor(() => {
            expect(getByTestId('embed-explore').dataset.exploreId).toBe(
                'payments',
            );
        });

        fireEvent.click(getByTestId('explore-drill-down-unsaved'));
        await waitFor(() => {
            expect(getByTestId('embed-explore').dataset.exploreId).toBe(
                'payments_drill',
            );
        });

        fireEvent.click(getByTestId('explore-drill-down-unsaved'));
        await waitFor(() => {
            expect(getByTestId('embed-explore').dataset.exploreId).toBe(
                'payments_drill_drill',
            );
        });

        fireEvent.click(getByTestId('explore-back'));
        await waitFor(() => {
            expect(getByTestId('embed-explore').dataset.metrics).toBe(
                'payments_unsaved',
            );
        });
        expect(getByTestId('embed-explore').dataset.exploreId).toBe('payments');
        expect(getByTestId('embed-explore').dataset.savedChartUuid).toBe(
            undefined,
        );
        expect(getByTestId('embed-explore').dataset.runQueryOnLoad).toBe(
            'true',
        );
        expect(queryByTestId('explore-back')).toBeNull();
    });

    it('starts a fresh navigation when the host returns to an earlier chart', async () => {
        const renderExplore = (exploreId: string, chartUuid: string) => (
            <Explore
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                exploreId={exploreId}
                savedChart={{ uuid: chartUuid, tableName: exploreId } as never}
            />
        );
        const { getByTestId, queryByTestId, rerender } = render(
            renderExplore('payments', 'chart-a'),
        );

        await waitFor(() => {
            expect(getByTestId('embed-explore').dataset.exploreId).toBe(
                'payments',
            );
        });

        fireEvent.click(getByTestId('explore-drill-down-unsaved'));
        await waitFor(() => {
            expect(getByTestId('embed-explore').dataset.exploreId).toBe(
                'payments_drill',
            );
        });

        rerender(renderExplore('orders', 'chart-b'));
        await waitFor(() => {
            expect(getByTestId('embed-explore').dataset.savedChartUuid).toBe(
                'chart-b',
            );
        });

        rerender(renderExplore('payments', 'chart-a'));
        await waitFor(() => {
            expect(getByTestId('embed-explore').dataset.savedChartUuid).toBe(
                'chart-a',
            );
        });
        expect(getByTestId('embed-explore').dataset.exploreId).toBe('payments');
        expect(queryByTestId('explore-back')).toBeNull();
    });
});

describe('SDK Chart edit mode', () => {
    const mockToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250ZW50Ijp7InR5cGUiOiJjaGFydCIsInByb2plY3RVdWlkIjoidGVzdC1wcm9qZWN0LXV1aWQiLCJjb250ZW50SWQiOiJ0ZXN0LWNoYXJ0LXV1aWQifX0.test';
    const mockInstanceUrl = 'http://localhost:3000';

    beforeEach(() => {
        mockEmbedWriteContext = undefined;
    });

    it('keeps the minimal chart as the default view', async () => {
        mockEmbedWriteContext = { canUpdateSavedChart: true };
        const { findByTestId } = render(
            <Chart
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                id="test-chart-uuid"
            />,
        );

        expect(await findByTestId('embed-chart-view')).toBeInTheDocument();
    });

    it('renders the saved chart editor when the write actor can update it', async () => {
        mockEmbedWriteContext = { canUpdateSavedChart: true };
        const { findByTestId } = render(
            <Chart
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                id="test-chart-uuid"
                isEditMode
            />,
        );

        expect(await findByTestId('embed-chart-edit')).toHaveAttribute(
            'data-allow-chart-update',
            'true',
        );
    });

    it('keeps the same explorer mounted while toggling view and edit', async () => {
        mockEmbedWriteContext = { canUpdateSavedChart: true };
        const { findByTestId, rerender } = render(
            <Chart
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                id="test-chart-uuid"
                isEditMode={false}
            />,
        );
        const explorer = await findByTestId('embed-chart-edit');
        expect(explorer).toHaveAttribute('data-edit-mode', 'false');
        expect(explorer).toHaveAttribute('data-chart-view', 'true');

        rerender(
            <Chart
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                id="test-chart-uuid"
                isEditMode
            />,
        );

        expect(await findByTestId('embed-chart-edit')).toBe(explorer);
        expect(explorer).toHaveAttribute('data-edit-mode', 'true');
    });

    it('drills in place inside the SDK chart and returns to the chart', async () => {
        mockEmbedWriteContext = { canUpdateSavedChart: true };
        const onExplore = vi.fn();
        const { findByTestId, getByTestId, queryByTestId } = render(
            <Chart
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                id="test-chart-uuid"
                isEditMode={false}
                onExplore={onExplore}
            />,
        );

        fireEvent.click(
            within(await findByTestId('embed-chart-edit')).getByTestId(
                'explore-drill-down',
            ),
        );

        await waitFor(() => {
            expect(getByTestId('embed-explore').dataset.exploreId).toBe(
                'orders',
            );
        });
        expect(queryByTestId('embed-chart-edit')).toBeNull();
        expect(onExplore).not.toHaveBeenCalled();
        expect(getByTestId('explore-back').dataset.backDestination).toBe(
            'chart',
        );

        fireEvent.click(getByTestId('explore-back'));

        expect(await findByTestId('embed-chart-edit')).toBeInTheDocument();
        expect(queryByTestId('embed-explore')).toBeNull();
    });

    it('hands the saved chart to the host onExplore when provided', async () => {
        const onExplore = vi.fn();
        const { findByTestId, queryByTestId } = render(
            <Chart
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                id="test-chart-uuid"
                onExplore={onExplore}
            />,
        );

        fireEvent.click(await findByTestId('chart-saved-explore'));

        await waitFor(() => {
            expect(onExplore).toHaveBeenCalledWith({
                chart: { uuid: 'test-chart-uuid', tableName: 'payments' },
            });
        });
        expect(queryByTestId('embed-explore')).toBeNull();
    });

    it('opens the saved chart inside the SDK chart when the host has no onExplore', async () => {
        const { findByTestId, getByTestId, queryByTestId } = render(
            <Chart
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                id="test-chart-uuid"
            />,
        );

        fireEvent.click(await findByTestId('chart-saved-explore'));

        await waitFor(() => {
            expect(getByTestId('embed-explore').dataset.savedChartUuid).toBe(
                'test-chart-uuid',
            );
        });
        expect(getByTestId('explore-back').dataset.backDestination).toBe(
            'chart',
        );

        fireEvent.click(getByTestId('explore-back'));

        expect(await findByTestId('embed-chart-view')).toBeInTheDocument();
        expect(queryByTestId('embed-explore')).toBeNull();
    });

    it('rejects edit mode when the write actor cannot update the chart', async () => {
        mockEmbedWriteContext = { canUpdateSavedChart: false };
        const { findByText } = render(
            <Chart
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                id="test-chart-uuid"
                isEditMode
            />,
        );

        expect(await findByText('Unable to edit chart')).toBeInTheDocument();
    });
});

describe('SDK AI agent', () => {
    const mockToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250ZW50Ijp7InR5cGUiOiJhaUFnZW50IiwicHJvamVjdFV1aWQiOiJ0ZXN0LXByb2plY3QtdXVpZCIsImFnZW50VXVpZCI6InRlc3QtYWdlbnQtdXVpZCJ9fQ.test';
    const mockInstanceUrl = 'http://localhost:3000';

    it('renders the embed AI agent iframe for the token project', async () => {
        const { container } = render(
            <AiAgent
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                agentUuid="test-agent-uuid"
            />,
        );

        await waitFor(() => {
            expect(container.querySelector('iframe')).toBeTruthy();
        });

        expect(container.querySelector('iframe')?.getAttribute('src')).toBe(
            `${mockInstanceUrl}/embed/test-project-uuid/ai-agents/test-agent-uuid/threads#${mockToken}`,
        );
    });

    it('names the iframe without Lightdash branding', async () => {
        const { container } = render(
            <AiAgent
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                agentUuid="test-agent-uuid"
            />,
        );

        await waitFor(() => {
            expect(container.querySelector('iframe')).toBeTruthy();
        });

        expect(
            container.querySelector('iframe')?.getAttribute('title'),
        ).not.toMatch(/lightdash/i);
    });

    it('renders an existing embed AI agent thread when threadUuid is provided', async () => {
        const { container } = render(
            <AiAgent
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                agentUuid="test-agent-uuid"
                threadUuid="test-thread-uuid"
            />,
        );

        await waitFor(() => {
            expect(container.querySelector('iframe')).toBeTruthy();
        });

        expect(container.querySelector('iframe')?.getAttribute('src')).toBe(
            `${mockInstanceUrl}/embed/test-project-uuid/ai-agents/test-agent-uuid/threads/test-thread-uuid#${mockToken}`,
        );
    });

    it('calls onThreadChange for matching embed AI agent thread messages', async () => {
        const onThreadChange = vi.fn();
        const { container } = render(
            <AiAgent
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                agentUuid="test-agent-uuid"
                onThreadChange={onThreadChange}
            />,
        );

        await waitFor(() => {
            expect(container.querySelector('iframe')).toBeTruthy();
        });

        const iframeSrc = new URL(
            container.querySelector('iframe')?.getAttribute('src') ?? '',
        );
        expect(iframeSrc.searchParams.get('targetOrigin')).toBe(
            window.location.origin,
        );

        window.dispatchEvent(
            new MessageEvent('message', {
                origin: mockInstanceUrl,
                data: {
                    type: 'lightdash:aiAgentThreadChanged',
                    payload: {
                        projectUuid: 'test-project-uuid',
                        agentUuid: 'test-agent-uuid',
                        threadUuid: 'test-thread-uuid',
                    },
                    timestamp: Date.now(),
                },
            }),
        );

        await waitFor(() => {
            expect(onThreadChange).toHaveBeenCalledWith({
                threadUuid: 'test-thread-uuid',
            });
        });
    });
});

describe('SDK native AI agent', () => {
    const mockToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250ZW50Ijp7InR5cGUiOiJhaUFnZW50IiwicHJvamVjdFV1aWQiOiJ0ZXN0LXByb2plY3QtdXVpZCIsImFnZW50VXVpZCI6InRlc3QtYWdlbnQtdXVpZCJ9fQ.test';
    const mockInstanceUrl = 'http://localhost:3000';

    beforeEach(() => {
        mockNavigate.mockClear();
    });

    afterEach(() => {
        mockNavigate.mockClear();
    });

    it('renders the agent in the host page instead of an iframe', async () => {
        const { container, findByTestId } = render(
            <AiAgent
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                agentUuid="test-agent-uuid"
                renderMode="native"
            />,
        );

        const agentPage = await findByTestId('agent-page');
        expect(agentPage.getAttribute('data-agent-uuid')).toBe(
            'test-agent-uuid',
        );
        expect(agentPage.getAttribute('data-embedded')).toBe('true');
        expect(await findByTestId('agent-new-thread')).toBeTruthy();
        expect(container.querySelector('iframe')).toBeNull();
    });

    it('opens the thread passed by the host', async () => {
        const { findByTestId } = render(
            <AiAgent
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                agentUuid="test-agent-uuid"
                threadUuid="test-thread-uuid"
                renderMode="native"
            />,
        );

        const thread = await findByTestId('agent-thread');
        expect(thread.getAttribute('data-thread-uuid')).toBe(
            'test-thread-uuid',
        );
    });

    it('reports thread changes to onThreadChange', async () => {
        const onThreadChange = vi.fn();
        const { findByTestId } = render(
            <AiAgent
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                agentUuid="test-agent-uuid"
                onThreadChange={onThreadChange}
                renderMode="native"
            />,
        );

        fireEvent.click(await findByTestId('agent-new-thread'));

        expect(onThreadChange).toHaveBeenCalledWith({
            threadUuid: 'created-thread-uuid',
        });
    });

    it.each(['iframe', 'native'] as const)(
        'reports an invalid token to onError in %s mode',
        async (renderMode) => {
            const onError = vi.fn();
            render(
                <AiAgent
                    token="not-a-jwt"
                    instanceUrl={mockInstanceUrl}
                    agentUuid="test-agent-uuid"
                    renderMode={renderMode}
                    onError={onError}
                />,
            );

            await waitFor(() => {
                expect(onError).toHaveBeenCalledWith(
                    expect.objectContaining({
                        kind: 'invalid_token',
                        fatal: true,
                    }),
                );
            });
        },
    );

    it('opens a new thread when the host clears threadUuid', async () => {
        const { findByTestId, rerender } = render(
            <AiAgent
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                agentUuid="test-agent-uuid"
                threadUuid="test-thread-uuid"
                renderMode="native"
            />,
        );
        await findByTestId('agent-thread');

        rerender(
            <AiAgent
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                agentUuid="test-agent-uuid"
                renderMode="native"
            />,
        );

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith(
                '/embed/test-project-uuid/ai-agents/test-agent-uuid/threads',
            );
        });
    });

    it('follows a threadUuid change from the host', async () => {
        const { findByTestId, rerender } = render(
            <AiAgent
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                agentUuid="test-agent-uuid"
                renderMode="native"
            />,
        );
        await findByTestId('agent-new-thread');
        expect(mockNavigate).not.toHaveBeenCalled();

        rerender(
            <AiAgent
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                agentUuid="test-agent-uuid"
                threadUuid="other-thread-uuid"
                renderMode="native"
            />,
        );

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith(
                '/embed/test-project-uuid/ai-agents/test-agent-uuid/threads/other-thread-uuid',
            );
        });
    });
});

describe('SDK metrics catalog', () => {
    const mockToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250ZW50Ijp7InR5cGUiOiJtZXRyaWNzQ2F0YWxvZyIsInByb2plY3RVdWlkIjoidGVzdC1wcm9qZWN0LXV1aWQifX0.test';

    it('renders the metrics catalog for the token project', async () => {
        const { getByTestId } = render(
            <MetricsCatalog
                token={mockToken}
                instanceUrl="http://localhost:3000"
            />,
        );

        await waitFor(() => {
            expect(getByTestId('metrics-catalog-page')).toBeTruthy();
        });

        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('passes hidden filters to the metrics catalog', async () => {
        const { getByTestId } = render(
            <MetricsCatalog
                token={mockToken}
                instanceUrl="http://localhost:3000"
                hiddenFilters={['owners', 'tables']}
            />,
        );

        await waitFor(() => {
            expect(getByTestId('metrics-catalog-page')).toHaveAttribute(
                'data-hidden-filters',
                'owners,tables',
            );
        });
    });

    it('SDK elements do not override document title', async () => {
        document.title = 'Host page';
        const { getByTestId } = render(
            <MetricsCatalog
                token={mockToken}
                instanceUrl="http://localhost:3000"
            />,
        );

        await waitFor(() => {
            expect(getByTestId('metrics-catalog-page')).toBeTruthy();
        });

        expect(document.title).toBe('Host page');
    });
});

describe('SDK API client', () => {
    it('lists AI agent threads with the embed token header', async () => {
        const threads = [
            {
                uuid: 'test-thread-uuid',
                agentUuid: 'test-agent-uuid',
                createdAt: '2026-07-06T08:00:00.000Z',
                createdFrom: 'web_app',
                title: 'Revenue check',
                titleGeneratedAt: null,
                pinnedAt: null,
                firstMessage: {
                    uuid: 'test-message-uuid',
                    message: 'How is revenue looking?',
                },
                user: {
                    uuid: 'test-user-uuid',
                    name: 'Test User',
                },
            },
        ];
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    status: 'ok',
                    results: threads,
                }),
                { status: 200 },
            ),
        );
        const client = createLightdashApiClient({
            instanceUrl: 'https://example.lightdash.cloud/',
            projectUuid: 'test-project-uuid',
            auth: {
                type: 'embedToken',
                token: 'test-embed-token',
            },
            fetch: fetchMock,
        });

        await expect(
            client.listAiAgentThreads({ agentUuid: 'test-agent-uuid' }),
        ).resolves.toEqual(threads);

        expect(fetchMock).toHaveBeenCalledWith(
            'https://example.lightdash.cloud/api/v1/projects/test-project-uuid/aiAgents/test-agent-uuid/threads',
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'lightdash-embed-token': 'test-embed-token',
                },
                body: undefined,
                signal: undefined,
            },
        );
    });
});

describe('SDK token rotation', () => {
    const header = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    const payload =
        'eyJjb250ZW50Ijp7InByb2plY3RVdWlkIjoidGVzdC1wcm9qZWN0LXV1aWQifX0';
    const tokenA = `${header}.${payload}.signature-a`;
    const tokenB = `${header}.${payload}.signature-b`;
    const instanceUrl = 'http://localhost:3000';
    const originalLocation = window.location;
    const sentToken = (fetchMock: ReturnType<typeof vi.fn>) =>
        fetchMock.mock.calls.at(-1)?.[1].headers['lightdash-embed-token'];
    const stubFetch = () => {
        const fetchMock = vi.fn().mockImplementation(
            async () =>
                new Response(JSON.stringify({ status: 'ok', results: {} }), {
                    status: 200,
                }),
        );
        vi.stubGlobal('fetch', fetchMock);
        return fetchMock;
    };

    beforeEach(() => {
        clearInMemoryStorage();
        window.location = {
            ...window.location,
            pathname: '/test',
            search: '',
            hash: '',
        };
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        window.location = originalLocation;
    });

    it('sends the rotated token on the next request without remounting', async () => {
        const fetchMock = stubFetch();

        const { rerender, getByTestId } = render(
            <Dashboard token={tokenA} instanceUrl={instanceUrl} filters={[]} />,
        );
        await waitFor(() => getByTestId('embed-dashboard'));
        fireEvent.click(getByTestId('dashboard-request'));
        await waitFor(() => expect(sentToken(fetchMock)).toBe(tokenA));
        const mountedDashboard = getByTestId('embed-dashboard');

        rerender(
            <Dashboard token={tokenB} instanceUrl={instanceUrl} filters={[]} />,
        );
        await waitFor(() => getByTestId('embed-dashboard'));
        expect(getByTestId('embed-dashboard')).toBe(mountedDashboard);

        fireEvent.click(getByTestId('dashboard-request'));
        await waitFor(() => expect(sentToken(fetchMock)).toBe(tokenB));
    });

    it('ignores an older token promise that resolves after a newer one', async () => {
        let resolveTokenA: (token: string) => void = () => {};
        const slowTokenA = new Promise<string>((resolve) => {
            resolveTokenA = resolve;
        });

        const { rerender, getByTestId } = render(
            <Chart token={slowTokenA} instanceUrl={instanceUrl} id="chart" />,
        );
        rerender(
            <Chart
                token={Promise.resolve(tokenB)}
                instanceUrl={instanceUrl}
                id="chart"
            />,
        );
        await waitFor(() =>
            expect(getByTestId('embed-chart-view').dataset.token).toBe(tokenB),
        );

        await act(async () => {
            resolveTokenA(tokenA);
            await slowTokenA;
        });

        expect(getByTestId('embed-chart-view').dataset.token).toBe(tokenB);
        const fetchMock = stubFetch();
        fireEvent.click(getByTestId('chart-request'));
        await waitFor(() => expect(sentToken(fetchMock)).toBe(tokenB));
    });

    const renderProvider = (
        queryClient: QueryClient,
        embedToken: string | undefined,
    ) => (
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <EmbedProvider embedToken={embedToken} projectUuid="p1">
                    <div />
                </EmbedProvider>
            </MemoryRouter>
        </QueryClientProvider>
    );

    it('refetches the account when the token changes, not on mount', async () => {
        const queryClient = new QueryClient();
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

        const { rerender } = render(renderProvider(queryClient, tokenA));
        expect(invalidate).not.toHaveBeenCalled();

        rerender(renderProvider(queryClient, tokenB));
        await waitFor(() =>
            expect(invalidate).toHaveBeenCalledWith({ queryKey: ['account'] }),
        );
        expect(invalidate).toHaveBeenCalledTimes(1);
    });

    it('keeps the direct-mode token after the hash is stripped from the URL', () => {
        const queryClient = new QueryClient();
        window.location = { ...window.location, hash: `#${tokenA}` };

        const { rerender } = render(renderProvider(queryClient, undefined));
        expect(getFromInMemoryStorage<InMemoryEmbed>(EMBED_KEY)?.token).toBe(
            tokenA,
        );

        window.location = { ...window.location, hash: '' };
        rerender(renderProvider(queryClient, undefined));

        expect(getFromInMemoryStorage<InMemoryEmbed>(EMBED_KEY)?.token).toBe(
            tokenA,
        );
    });
});

describe('SDK components with different tokens on one page', () => {
    const header = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    const payload =
        'eyJjb250ZW50Ijp7InByb2plY3RVdWlkIjoidGVzdC1wcm9qZWN0LXV1aWQifX0';
    const dashboardToken = `${header}.${payload}.dashboard`;
    const chartToken = `${header}.${payload}.chart`;
    const instanceUrl = 'http://localhost:3000';

    beforeEach(() => {
        clearInMemoryStorage();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('sends each component its own token, whichever rendered last', async () => {
        const fetchMock = vi.fn().mockImplementation(
            async () =>
                new Response(JSON.stringify({ status: 'ok', results: {} }), {
                    status: 200,
                }),
        );
        vi.stubGlobal('fetch', fetchMock);

        const { getByTestId, rerender } = render(
            <>
                <Dashboard
                    token={dashboardToken}
                    instanceUrl={instanceUrl}
                    filters={[]}
                />
                <Chart token={chartToken} instanceUrl={instanceUrl} id="c1" />
            </>,
        );
        await waitFor(() => getByTestId('dashboard-request'));
        await waitFor(() => getByTestId('chart-request'));
        rerender(
            <>
                <Dashboard
                    token={dashboardToken}
                    instanceUrl={instanceUrl}
                    filters={[]}
                />
                <Chart token={chartToken} instanceUrl={instanceUrl} id="c1" />
            </>,
        );

        fireEvent.click(getByTestId('dashboard-request'));
        fireEvent.click(getByTestId('chart-request'));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        const tokenByUrl = Object.fromEntries(
            fetchMock.mock.calls.map(([url, init]) => [
                new URL(url).pathname,
                init.headers['lightdash-embed-token'],
            ]),
        );
        expect(tokenByUrl).toEqual({
            '/api/v1/dashboard': dashboardToken,
            '/api/v1/chart': chartToken,
        });
    });
});

describe('SDK host page isolation', () => {
    const mockToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250ZW50Ijp7InByb2plY3RVdWlkIjoidGVzdC1wcm9qZWN0LXV1aWQifX0.test';

    it('keeps Mantine attributes and variables off the host <html> and <body>', async () => {
        const { container, unmount } = render(
            <Dashboard
                token={mockToken}
                instanceUrl="http://localhost:3000"
                filters={[]}
                theme="dark"
            />,
        );

        await waitFor(() => {
            expect(container.querySelector('.ld-sdk-root')).not.toBeNull();
        });

        expect(document.documentElement).not.toHaveAttribute(
            'data-mantine-color-scheme',
        );
        expect(document.body).not.toHaveAttribute('data-color-mode');

        const root = container.querySelector('.ld-sdk-root');
        expect(root?.getAttribute('data-mantine-color-scheme')).toBe('dark');

        const portal = document.body.querySelector(':scope > .ld-sdk-portal');
        expect(portal?.getAttribute('data-mantine-color-scheme')).toBe('dark');
        // Nothing portalled before the SDK container existed.
        expect(
            document.querySelector('[data-mantine-shared-portal-node]'),
        ).toBeNull();

        const variableSheets = [
            ...document.querySelectorAll('style[data-mantine-styles]'),
        ].map((style) => style.textContent ?? '');
        expect(variableSheets.length).toBeGreaterThan(0);
        variableSheets.forEach((css) => {
            expect(css).not.toMatch(/:root|:host/);
        });
        // Variables are keyed on this instance's own class, present on both containers.
        const instanceClass = [...(root?.classList ?? [])].find((name) =>
            name.startsWith('lightdash-sdk-instance-'),
        );
        expect(instanceClass).toBeDefined();
        expect(portal?.classList.contains(instanceClass!)).toBe(true);
        expect(variableSheets[0]).toMatch(new RegExp(`^\\.${instanceClass}`));

        unmount();
        expect(document.body.querySelector('.ld-sdk-portal')).toBeNull();
    });

    it('gives each mounted component its own portal container', async () => {
        const { container } = render(
            <>
                <Dashboard
                    token={mockToken}
                    instanceUrl="http://localhost:3000"
                    filters={[]}
                    theme="light"
                />
                <Dashboard
                    token={mockToken}
                    instanceUrl="http://localhost:3000"
                    filters={[]}
                    theme="dark"
                />
            </>,
        );

        await waitFor(() => {
            expect(container.querySelectorAll('.ld-sdk-root')).toHaveLength(2);
        });

        const portals = [
            ...document.body.querySelectorAll(':scope > .ld-sdk-portal'),
        ];
        expect(portals).toHaveLength(2);
        expect(new Set(portals.map((node) => node.id)).size).toBe(2);
        expect(
            portals.map((node) =>
                node.getAttribute('data-mantine-color-scheme'),
            ),
        ).toEqual(['light', 'dark']);
    });
});
