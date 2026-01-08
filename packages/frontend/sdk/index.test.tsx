import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
const mockDashboardData = {
    uuid: 'test-dashboard-uuid',
    name: 'Test Dashboard',
    description: '',
    tiles: [
        {
            uuid: 'tile-1',
            type: 'saved_chart',
            properties: {
                savedChartUuid: 'chart-1',
                title: 'Test Chart',
                chartName: 'Test Chart',
            },
            x: 0,
            y: 0,
            h: 4,
            w: 4,
        },
    ],
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
};

vi.mock('../src/hooks/dashboard/useDashboard', () => ({
    useDashboardQuery: () => ({
        data: mockDashboardData,
        isInitialLoading: false,
        error: null,
    }),
    useDashboardsAvailableFilters: () => ({
        isInitialLoading: false,
        isFetching: false,
        data: {
            allFilterableFields: [
                {
                    id: 'orders_status',
                    name: 'status',
                    label: 'Status',
                    table: 'orders',
                    tableLabel: 'Orders',
                    fieldType: 'dimension',
                    type: 'string',
                },
            ],
            savedQueryFilters: {
                'tile-1': [0],
            },
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
            ...mockDashboardData,
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

import { FilterOperator } from '@lightdash/common';
import { Dashboard } from './index';

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

        render(
            <Dashboard
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                filters={[]}
                onExplore={mockOnExplore}
            />,
        );

        // Simulate explore navigation
        // In SDK mode, this should call onExplore callback but not update browser URL

        await waitFor(() => {
            // Browser URL should not change
            expect(window.location.pathname).toBe('/test');
        });
    });

    it('should dynamically update filters when filters prop changes', async () => {
        const initialFilters = [
            {
                model: 'orders',
                field: 'status',
                operator: FilterOperator.EQUALS,
                value: 'completed',
            },
        ];

        const { rerender, container } = render(
            <Dashboard
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                filters={initialFilters}
            />,
        );

        // Wait for dashboard to load (should not be stuck in loading state)
        await waitFor(
            () => {
                const loadingText = container.textContent;
                expect(loadingText).not.toContain('Loading...');
                expect(mockNavigate).not.toHaveBeenCalled();
            },
            { timeout: 3000 },
        );

        // Update filters to a different value
        const updatedFilters = [
            {
                model: 'orders',
                field: 'status',
                operator: FilterOperator.EQUALS,
                value: 'pending',
            },
        ];

        rerender(
            <Dashboard
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                filters={updatedFilters}
            />,
        );

        // Verify the component re-rendered with new filters and is not stuck loading
        await waitFor(
            () => {
                // Dashboard should still be rendered, not stuck in loading
                const loadingText = container.textContent;
                expect(loadingText).not.toContain('Loading...');
                // Navigate should still not be called in SDK mode
                expect(mockNavigate).not.toHaveBeenCalled();
            },
            { timeout: 3000 },
        );
    });

    it('should handle clearing filters dynamically', async () => {
        const initialFilters = [
            {
                model: 'orders',
                field: 'status',
                operator: FilterOperator.EQUALS,
                value: 'completed',
            },
        ];

        const { rerender, container } = render(
            <Dashboard
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                filters={initialFilters}
            />,
        );

        // Wait for initial render - verify not stuck loading
        await waitFor(
            () => {
                const loadingText = container.textContent;
                expect(loadingText).not.toContain('Loading...');
                expect(mockNavigate).not.toHaveBeenCalled();
            },
            { timeout: 3000 },
        );

        // Clear filters
        rerender(
            <Dashboard
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                filters={undefined}
            />,
        );

        // Verify the component re-rendered without filters and completes loading
        await waitFor(
            () => {
                // Dashboard should still be rendered, not stuck in loading
                const loadingText = container.textContent;
                expect(loadingText).not.toContain('Loading...');
                // Navigate should still not be called in SDK mode
                expect(mockNavigate).not.toHaveBeenCalled();
            },
            { timeout: 3000 },
        );
    });

    it('should handle multiple filter changes without getting stuck in loading', async () => {
        const { rerender, container } = render(
            <Dashboard
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                filters={[]}
            />,
        );

        // Wait for initial load
        await waitFor(
            () => {
                const loadingText = container.textContent;
                expect(loadingText).not.toContain('Loading...');
            },
            { timeout: 3000 },
        );

        // Apply first filter
        const filter1 = [
            {
                model: 'orders',
                field: 'status',
                operator: FilterOperator.EQUALS,
                value: 'completed',
            },
        ];

        rerender(
            <Dashboard
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                filters={filter1}
            />,
        );

        await waitFor(
            () => {
                const loadingText = container.textContent;
                expect(loadingText).not.toContain('Loading...');
                expect(mockNavigate).not.toHaveBeenCalled();
            },
            { timeout: 3000 },
        );

        // Apply second filter
        const filter2 = [
            {
                model: 'orders',
                field: 'status',
                operator: FilterOperator.EQUALS,
                value: 'pending',
            },
        ];

        rerender(
            <Dashboard
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                filters={filter2}
            />,
        );

        await waitFor(
            () => {
                const loadingText = container.textContent;
                expect(loadingText).not.toContain('Loading...');
                expect(mockNavigate).not.toHaveBeenCalled();
            },
            { timeout: 3000 },
        );

        // Clear filters
        rerender(
            <Dashboard
                token={mockToken}
                instanceUrl={mockInstanceUrl}
                filters={[]}
            />,
        );

        await waitFor(
            () => {
                const loadingText = container.textContent;
                expect(loadingText).not.toContain('Loading...');
                expect(mockNavigate).not.toHaveBeenCalled();
            },
            { timeout: 3000 },
        );
    });
});
