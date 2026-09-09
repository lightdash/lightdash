import { SearchItemType, type SearchResults } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import { useOmnibarSearch } from './useOmnibarSearch';

vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));

const mockApi = vi.mocked(lightdashApi);

const empty: SearchResults = {
    spaces: [],
    dashboards: [],
    savedCharts: [],
    sqlCharts: [],
    tables: [],
    fields: [],
    pages: [],
    dashboardTabs: [],
    dataApps: [],
};
const content: SearchResults = {
    ...empty,
    pages: [{ uuid: 'activity', name: 'User activity', url: '/activity' }],
};
const explores: SearchResults = {
    ...empty,
    tables: [
        {
            name: 'orders',
            label: 'Orders',
            explore: 'orders',
            exploreLabel: 'Orders',
            regexMatchCount: 1,
        },
    ],
};
const params = {
    projectUuid: 'project-uuid',
    query: 'orders',
    canManageExplore: true,
    enabled: true,
};
const deferred = () => {
    let resolve!: (value: SearchResults) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<SearchResults>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};
const createWrapper = () => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, cacheTime: 0 } },
        logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    return ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
};
const getScope = (url: string) =>
    new URL(url, 'http://localhost').searchParams.get('scope') ?? 'all';

describe('useOmnibarSearch', () => {
    beforeEach(() => {
        mockApi.mockReset();
    });

    it.each(['content', 'explores'] as const)(
        'shows %s results without waiting for the other request',
        async (first) => {
            const requests = { content: deferred(), explores: deferred() };
            mockApi.mockImplementation(
                ({ url }) =>
                    requests[getScope(url) as keyof typeof requests].promise,
            );
            const { result } = renderHook(() => useOmnibarSearch(params), {
                wrapper: createWrapper(),
            });
            expect(lightdashApi).toHaveBeenCalledTimes(2);
            await act(async () =>
                requests[first].resolve(
                    first === 'content' ? content : explores,
                ),
            );
            await waitFor(() =>
                expect(
                    result.current.data?.[
                        first === 'content' ? 'pages' : 'tables'
                    ],
                ).toHaveLength(1),
            );
            expect(result.current.isFetching).toBe(true);
            expect(
                result.current.data?.[first === 'content' ? 'tables' : 'pages'],
            ).toEqual([]);
            const second = first === 'content' ? 'explores' : 'content';
            await act(async () =>
                requests[second].resolve(
                    second === 'content' ? content : explores,
                ),
            );
            await waitFor(() => expect(result.current.isFetching).toBe(false));
            expect(result.current.data?.pages).toHaveLength(1);
            expect(result.current.data?.tables).toHaveLength(1);
        },
    );

    it('keeps successful results and retries only the failed request', async () => {
        const pending = deferred();
        mockApi.mockImplementation(({ url }) =>
            getScope(url) === 'content'
                ? Promise.resolve(content)
                : pending.promise,
        );
        const { result } = renderHook(() => useOmnibarSearch(params), {
            wrapper: createWrapper(),
        });
        await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
        await act(async () => pending.reject(new Error('Search failed')));
        await waitFor(() => expect(result.current.error).toBeTruthy());
        expect(result.current.data?.pages).toHaveLength(1);
        mockApi.mockResolvedValue(explores);
        await act(async () => {
            await result.current.retryFailed();
        });
        await waitFor(() => expect(result.current.error).toBeNull());
        expect(result.current.data?.pages).toHaveLength(1);
        expect(result.current.data?.tables).toHaveLength(1);
        expect(
            mockApi.mock.calls.map(([request]) => getScope(request.url)),
        ).toEqual(['content', 'explores', 'explores']);
    });

    it('cancels superseded requests and never mixes different search terms', async () => {
        const old = { content: deferred(), explores: deferred() };
        mockApi.mockImplementation(({ url }) =>
            url.includes('/search/orders?')
                ? old[getScope(url) as keyof typeof old].promise
                : Promise.resolve(content),
        );
        const { result, rerender } = renderHook(
            ({ query }) => useOmnibarSearch({ ...params, query }),
            {
                initialProps: { query: 'orders' },
                wrapper: createWrapper(),
            },
        );
        const signals = mockApi.mock.calls.map(([request]) => request.signal);
        rerender({ query: 'activity' });
        await waitFor(() => expect(result.current.isFetching).toBe(false));
        expect(signals.every((signal) => signal?.aborted)).toBe(true);
        await act(async () => {
            old.content.resolve(empty);
            old.explores.resolve(explores);
        });
        expect(result.current.data?.pages).toHaveLength(1);
        expect(result.current.data?.tables).toEqual([]);
    });

    it.each([
        { name: 'viewer', canManageExplore: false, filters: undefined },
        {
            name: 'item filter',
            canManageExplore: true,
            filters: { type: SearchItemType.FIELD },
        },
        {
            name: 'verified filter',
            canManageExplore: true,
            filters: { verifiedOnly: true },
        },
    ])(
        'keeps one request for $name searches',
        async ({ canManageExplore, filters }) => {
            mockApi.mockResolvedValue(empty);
            const { result } = renderHook(
                () =>
                    useOmnibarSearch({ ...params, canManageExplore, filters }),
                { wrapper: createWrapper() },
            );
            await waitFor(() => expect(result.current.isFetching).toBe(false));
            expect(lightdashApi).toHaveBeenCalledTimes(1);
            expect(getScope(mockApi.mock.calls[0][0].url)).toBe('all');
        },
    );

    it.each([
        { enabled: false, query: 'orders' },
        { enabled: true, query: 'or' },
    ])(
        'does not request results when disabled or below minimum length',
        (options) => {
            renderHook(() => useOmnibarSearch({ ...params, ...options }), {
                wrapper: createWrapper(),
            });
            expect(lightdashApi).not.toHaveBeenCalled();
        },
    );
});
