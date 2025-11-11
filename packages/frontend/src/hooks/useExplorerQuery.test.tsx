import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createExplorerStore } from '../features/explorer/store';
import { useExplorerQuery } from './useExplorerQuery';

// Mock the hooks that depend on external APIs
vi.mock('./useExplore', () => ({
    useExplore: vi.fn(() => ({ data: null })),
}));

vi.mock('./useFeatureFlagEnabled', () => ({
    useFeatureFlag: vi.fn(() => ({ data: { enabled: false } })),
}));

vi.mock('./parameters/useParameters', () => ({
    useParameters: vi.fn(() => ({ data: {} })),
}));

vi.mock('../providers/Explorer/useQueryExecutor', () => ({
    useQueryExecutor: vi.fn(() => [
        {
            query: { isFetched: false, isFetching: false },
            queryResults: {
                queryUuid: null,
                totalResults: 0,
                isFetchingFirstPage: false,
                isFetchingAllPages: false,
                error: null,
            },
        },
        vi.fn(),
    ]),
}));

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    const store = createExplorerStore();

    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <Provider store={store}>
                <MemoryRouter>{children}</MemoryRouter>
            </Provider>
        </QueryClientProvider>
    );
};

describe('useExplorerQuery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return query state and actions', () => {
        const { result } = renderHook(() => useExplorerQuery(), {
            wrapper: createWrapper(),
        });

        expect(result.current).toHaveProperty('query');
        expect(result.current).toHaveProperty('queryResults');
        expect(result.current).toHaveProperty('isLoading');
        expect(result.current).toHaveProperty('runQuery');
        expect(result.current).toHaveProperty('resetQueryResults');
        expect(result.current).toHaveProperty('getDownloadQueryUuid');
        expect(result.current).toHaveProperty('activeFields');
    });

    it('should compute loading state correctly', () => {
        const { result } = renderHook(() => useExplorerQuery(), {
            wrapper: createWrapper(),
        });

        // Should be false initially when not fetching
        expect(result.current.isLoading).toBe(false);
    });

    it('should have empty activeFields when no dimensions/metrics selected', () => {
        const { result } = renderHook(() => useExplorerQuery(), {
            wrapper: createWrapper(),
        });

        expect(result.current.activeFields.size).toBe(0);
    });

    it('should provide validQueryArgs as null initially', () => {
        const { result } = renderHook(() => useExplorerQuery(), {
            wrapper: createWrapper(),
        });

        expect(result.current.validQueryArgs).toBeNull();
    });
});
