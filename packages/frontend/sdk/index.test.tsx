import { fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockEmbedWriteContext: { canUpdateSavedChart: boolean } | undefined;

vi.mock('../src/ee/pages/EmbedDashboard', async () => {
    const { default: useEmbed } =
        await import('../src/ee/providers/Embed/useEmbed');

    return {
        default: function MockEmbedDashboard() {
            const { onExplore } = useEmbed();
            return (
                <div data-testid="embed-dashboard">
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

vi.mock('../src/ee/pages/EmbedChart', () => ({
    default: () => <div data-testid="embed-chart-view" />,
}));

vi.mock('../src/ee/pages/EmbedExplore', () => ({
    default: ({
        allowChartUpdate,
        isEditMode,
        chartView,
    }: {
        allowChartUpdate?: boolean;
        isEditMode?: boolean;
        chartView?: boolean;
    }) => (
        <div
            data-testid={
                chartView === undefined ? 'embed-explore' : 'embed-chart-edit'
            }
            data-allow-chart-update={allowChartUpdate}
            data-edit-mode={isEditMode}
            data-chart-view={chartView}
        />
    ),
}));

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
    const ReactModule = await import('react');

    return {
        default: () =>
            ReactModule.createElement('div', {
                'data-testid': 'metrics-catalog-page',
            }),
    };
});

import { FilterOperator } from '@lightdash/common';
import {
    AiAgent,
    Chart,
    Dashboard,
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
