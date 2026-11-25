import { QueryClient, QueryObserver } from '@tanstack/react-query';
import {
    evictSavedDashboardResults,
    waitForTileSlot,
} from './useDashboardRefresh';

const tileKey = (chartUuid: string) => [
    'dashboard_chart_ready_query',
    'proj',
    chartUuid,
    'dash',
];
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('evictSavedDashboardResults', () => {
    let queryClient: QueryClient;
    const mountTile = (chartUuid: string) =>
        new QueryObserver(queryClient, {
            queryKey: tileKey(chartUuid),
            queryFn: () => chartUuid,
            staleTime: Infinity,
        }).subscribe(() => {});

    beforeEach(() => {
        queryClient = new QueryClient();
    });

    it('drops results off screen and keeps on-screen ones and other queries', () => {
        queryClient.setQueryData(tileKey('hidden'), 'old');
        queryClient.setQueryData(['saved_dashboard_query', 'dash'], 'dash');
        queryClient.setQueryData(tileKey('shown'), 'old');
        mountTile('shown');

        evictSavedDashboardResults(queryClient);

        expect(queryClient.getQueryData(tileKey('hidden'))).toBeUndefined();
        expect(queryClient.getQueryData(tileKey('shown'))).toBe('old');
        expect(
            queryClient.getQueryData(['saved_dashboard_query', 'dash']),
        ).toBe('dash');
    });

    it('drops an on-screen result once its tile unmounts', async () => {
        queryClient.setQueryData(tileKey('shown'), 'old');
        const unmount = mountTile('shown');
        evictSavedDashboardResults(queryClient);

        unmount();
        await flush();

        expect(queryClient.getQueryData(tileKey('shown'))).toBeUndefined();
    });

    it('keeps results fetched after the save', async () => {
        queryClient.setQueryData(tileKey('shown'), 'old');
        const unmountShown = mountTile('shown');
        evictSavedDashboardResults(queryClient);

        await queryClient.refetchQueries(tileKey('shown'));
        const unmountLater = mountTile('later');
        await flush();
        unmountShown();
        unmountLater();
        await flush();

        expect(queryClient.getQueryData(tileKey('shown'))).toBe('shown');
        expect(queryClient.getQueryData(tileKey('later'))).toBe('later');
    });

    it('fetches again after a request that started before the save', async () => {
        const responses: ((value: string) => void)[] = [];
        const unmount = new QueryObserver(queryClient, {
            queryKey: tileKey('shown'),
            queryFn: () =>
                new Promise<string>((resolve) => {
                    responses.push(resolve);
                }),
        }).subscribe(() => {});
        evictSavedDashboardResults(queryClient);

        responses[0]('pre-save');
        await flush();
        expect(responses).toHaveLength(2);
        responses[1]('post-save');
        await flush();
        unmount();
        await flush();

        expect(queryClient.getQueryData(tileKey('shown'))).toBe('post-save');
    });

    it('keeps a result whose tile remounts in the same tick', async () => {
        queryClient.setQueryData(tileKey('shown'), 'old');
        const unmount = mountTile('shown');
        evictSavedDashboardResults(queryClient);

        unmount();
        const remounted = mountTile('shown');
        await flush();

        expect(queryClient.getQueryData(tileKey('shown'))).toBe('old');
        remounted();
    });

    it('does not fetch again for a tile still queued for a slot at the save', async () => {
        let freeSlot: () => void = () => {};
        const slot = new Promise<void>((resolve) => {
            freeSlot = resolve;
        });
        let calls = 0;
        const unmount = new QueryObserver(queryClient, {
            queryKey: tileKey('queued'),
            queryFn: async ({ queryKey }) => {
                await waitForTileSlot(queryClient, queryKey, slot);
                calls += 1;
                return 'sent after save';
            },
        }).subscribe(() => {});
        await flush();
        evictSavedDashboardResults(queryClient);

        freeSlot();
        await flush();
        await flush();

        expect(calls).toBe(1);
        unmount();
    });
});
