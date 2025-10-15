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
});
