import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { explorerStore } from '../features/explorer/store';
import { useExplorerQuery, useExplorerQueryActions } from './useExplorerQuery';

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

vi.mock('../providers/Explorer/useExplorerQueryManager', () => ({
    useQueryManager: vi.fn(() => [
        {
            query: { isFetched: false, isFetching: false },
            queryResults: { queryUuid: null, totalResults: 0 },
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

    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <Provider store={explorerStore}>
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
        expect(result.current).toHaveProperty('runQuery');
        expect(result.current).toHaveProperty('resetQueryResults');
        expect(result.current).toHaveProperty('getDownloadQueryUuid');
        expect(result.current).toHaveProperty('activeFields');
        expect(result.current).toHaveProperty('isValidQuery');
    });

    it('should have empty activeFields when no dimensions/metrics selected', () => {
        const { result } = renderHook(() => useExplorerQuery(), {
            wrapper: createWrapper(),
        });

        expect(result.current.activeFields.size).toBe(0);
        expect(result.current.isValidQuery).toBe(false);
    });

    it('should provide validQueryArgs as null initially', () => {
        const { result } = renderHook(() => useExplorerQuery(), {
            wrapper: createWrapper(),
        });

        expect(result.current.validQueryArgs).toBeNull();
    });
});

describe('useExplorerQueryActions', () => {
    it('should return fetchResults and cancelQuery functions', () => {
        const { result } = renderHook(
            () => useExplorerQueryActions('test-project', 'test-query'),
            {
                wrapper: createWrapper(),
            },
        );

        expect(result.current).toHaveProperty('fetchResults');
        expect(result.current).toHaveProperty('cancelQuery');
        expect(typeof result.current.fetchResults).toBe('function');
        expect(typeof result.current.cancelQuery).toBe('function');
    });
});
