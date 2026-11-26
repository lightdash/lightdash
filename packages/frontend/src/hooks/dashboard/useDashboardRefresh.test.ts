import { QueryHistoryStatus } from '@lightdash/common';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import {
    evictSavedDashboardResults,
    sendTileRequest,
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
            queryFn: ({ queryKey }) =>
                sendTileRequest(
                    queryClient,
                    queryKey,
                    new Promise<string>((resolve) => {
                        responses.push(resolve);
                    }),
                ),
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

    it('keeps the result of a tile still queued for a slot at the save, fetched once', async () => {
        let freeSlot: () => void = () => {};
        const slot = new Promise<void>((resolve) => {
            freeSlot = resolve;
        });
        let calls = 0;
        const unmount = new QueryObserver(queryClient, {
            queryKey: tileKey('queued'),
            queryFn: async ({ queryKey }) => {
                await slot;
                calls += 1;
                return sendTileRequest(
                    queryClient,
                    queryKey,
                    Promise.resolve('sent after save'),
                );
            },
        }).subscribe(() => {});
        await flush();
        evictSavedDashboardResults(queryClient);

        freeSlot();
        await flush();
        await flush();
        unmount();
        await flush();

        expect(calls).toBe(1);
        expect(queryClient.getQueryData(tileKey('queued'))).toBe(
            'sent after save',
        );
    });

    it('runs a tile again when its rows were still loading at the save', async () => {
        const calls: string[] = [];
        const mountModelTile = (chartUuid: string) =>
            new QueryObserver(queryClient, {
                queryKey: tileKey(chartUuid),
                queryFn: () => {
                    calls.push(chartUuid);
                    return { executeQueryResponse: { queryUuid: chartUuid } };
                },
                staleTime: Infinity,
            }).subscribe(() => {});
        const rowsPage = (queryUuid: string, status: QueryHistoryStatus) =>
            queryClient.setQueryData(['query-page', { queryUuid, page: 1 }], {
                status,
                queryUuid,
            });
        const unmountLoading = mountModelTile('loading');
        const unmountLoaded = mountModelTile('loaded');
        await flush();
        rowsPage('loading', QueryHistoryStatus.EXECUTING);
        rowsPage('loaded', QueryHistoryStatus.READY);

        evictSavedDashboardResults(queryClient);
        await flush();

        expect(calls).toEqual(['loading', 'loaded', 'loading']);
        unmountLoading();
        unmountLoaded();
    });

    it('does not fetch again for a tile that left as its pre-save request landed', async () => {
        const responses: ((value: string) => void)[] = [];
        const unmount = new QueryObserver(queryClient, {
            queryKey: tileKey('left'),
            queryFn: ({ queryKey }) =>
                sendTileRequest(
                    queryClient,
                    queryKey,
                    new Promise<string>((resolve) => {
                        responses.push(resolve);
                    }),
                ),
        }).subscribe(() => {});
        evictSavedDashboardResults(queryClient);

        unmount();
        responses[0]('pre-save');
        await flush();

        expect(responses).toHaveLength(1);
        expect(queryClient.getQueryData(tileKey('left'))).toBeUndefined();
    });

    it('fetches again after a request that started before the save fails', async () => {
        let calls = 0;
        let failFirst: (error: Error) => void = () => {};
        const unmount = new QueryObserver(queryClient, {
            queryKey: tileKey('failed'),
            queryFn: ({ queryKey }) => {
                calls += 1;
                return calls === 1
                    ? sendTileRequest(
                          queryClient,
                          queryKey,
                          new Promise<string>((_resolve, reject) => {
                              failFirst = reject;
                          }),
                      )
                    : 'post-save';
            },
            retry: false,
        }).subscribe(() => {});
        evictSavedDashboardResults(queryClient);

        failFirst(new Error('not found'));
        await flush();

        expect(calls).toBe(2);
        expect(queryClient.getQueryData(tileKey('failed'))).toBe('post-save');
        unmount();
    });

    it('keeps the result of a retry sent after the save without fetching again', async () => {
        let calls = 0;
        let failFirst: (error: Error) => void = () => {};
        const unmount = new QueryObserver(queryClient, {
            queryKey: tileKey('retried'),
            queryFn: ({ queryKey }) => {
                calls += 1;
                return calls === 1
                    ? sendTileRequest(
                          queryClient,
                          queryKey,
                          new Promise<string>((_resolve, reject) => {
                              failFirst = reject;
                          }),
                      )
                    : 'retried';
            },
            retry: 1,
            retryDelay: 0,
        }).subscribe(() => {});
        evictSavedDashboardResults(queryClient);

        failFirst(new Error('dropped'));
        await flush();
        await flush();
        unmount();
        await flush();

        expect(calls).toBe(2);
        expect(queryClient.getQueryData(tileKey('retried'))).toBe('retried');
    });

    it('keeps the result of a retry sent after a save made during its backoff', async () => {
        let calls = 0;
        const unmount = new QueryObserver(queryClient, {
            queryKey: tileKey('backoff'),
            queryFn: ({ queryKey }) => {
                calls += 1;
                return sendTileRequest(
                    queryClient,
                    queryKey,
                    calls === 1
                        ? Promise.reject(new Error('reset'))
                        : Promise.resolve('retried'),
                );
            },
            retry: 1,
            retryDelay: 20,
        }).subscribe(() => {});
        await flush();
        evictSavedDashboardResults(queryClient);

        await new Promise((resolve) => setTimeout(resolve, 40));
        unmount();
        await flush();

        expect(calls).toBe(2);
        expect(queryClient.getQueryData(tileKey('backoff'))).toBe('retried');
    });

    it('runs a tile again when it showed an error at the save', async () => {
        let calls = 0;
        const unmount = new QueryObserver(queryClient, {
            queryKey: tileKey('errored'),
            queryFn: () => {
                calls += 1;
                return calls === 1
                    ? Promise.reject(new Error('not found'))
                    : Promise.resolve('recovered');
            },
            retry: false,
        }).subscribe(() => {});
        await flush();
        evictSavedDashboardResults(queryClient);
        await flush();

        expect(calls).toBe(2);
        expect(queryClient.getQueryData(tileKey('errored'))).toBe('recovered');
        unmount();
    });

    it('keeps a post-save result that lands after its tile leaves', async () => {
        let respond: (value: string) => void = () => {};
        queryClient.setQueryData(tileKey('leaving'), 'old');
        const unmount = new QueryObserver(queryClient, {
            queryKey: tileKey('leaving'),
            queryFn: () =>
                new Promise<string>((resolve) => {
                    respond = resolve;
                }),
            staleTime: Infinity,
        }).subscribe(() => {});
        evictSavedDashboardResults(queryClient);

        void queryClient.refetchQueries(tileKey('leaving'));
        unmount();
        await flush();
        respond('fresh');
        await flush();

        expect(queryClient.getQueryData(tileKey('leaving'))).toBe('fresh');
    });

    it('drops a result whose post-save request is cancelled as its tile leaves', async () => {
        queryClient.setQueryData(tileKey('cancelled'), 'old');
        const unmount = new QueryObserver(queryClient, {
            queryKey: tileKey('cancelled'),
            queryFn: ({ signal }) =>
                new Promise<string>((_resolve, reject) => {
                    signal?.addEventListener('abort', () =>
                        reject(new Error('aborted')),
                    );
                }),
            staleTime: Infinity,
        }).subscribe(() => {});
        evictSavedDashboardResults(queryClient);

        void queryClient.refetchQueries(tileKey('cancelled')).catch(() => {});
        unmount();
        await flush();
        await flush();

        expect(queryClient.getQueryData(tileKey('cancelled'))).toBeUndefined();
    });

    it('drops a result whose post-save request fails after its tile leaves', async () => {
        let fail: (error: Error) => void = () => {};
        queryClient.setQueryData(tileKey('failing'), 'old');
        const unmount = new QueryObserver(queryClient, {
            queryKey: tileKey('failing'),
            queryFn: () =>
                new Promise<string>((_resolve, reject) => {
                    fail = reject;
                }),
            staleTime: Infinity,
            retry: false,
        }).subscribe(() => {});
        evictSavedDashboardResults(queryClient);

        void queryClient.refetchQueries(tileKey('failing')).catch(() => {});
        unmount();
        await flush();
        fail(new Error('server error'));
        await flush();

        expect(queryClient.getQueryData(tileKey('failing'))).toBeUndefined();
    });

    it('fetches again when a second pre-save request is still out after the first lands', async () => {
        const responses: ((value: string) => void)[] = [];
        const send = () =>
            sendTileRequest(
                queryClient,
                tileKey('overlap'),
                new Promise<string>((resolve) => {
                    responses.push(resolve);
                }),
            );
        queryClient.setQueryData(tileKey('overlap'), 'old');
        const unmount = new QueryObserver(queryClient, {
            queryKey: tileKey('overlap'),
            queryFn: send,
            staleTime: Infinity,
        }).subscribe(() => {});
        // A request left over from before a remount, then the tile's own
        const leftover = send();
        void queryClient.refetchQueries(tileKey('overlap'));
        responses[0]('leftover');
        await leftover;
        evictSavedDashboardResults(queryClient);

        responses[1]('pre-save');
        await flush();

        expect(responses).toHaveLength(3);
        responses[2]('post-save');
        await flush();
        expect(queryClient.getQueryData(tileKey('overlap'))).toBe('post-save');
        unmount();
    });

    it('does not count a request whose fetch was cancelled as still out at the save', async () => {
        const responses: ((value: string) => void)[] = [];
        const send = (signal?: AbortSignal) =>
            sendTileRequest(
                queryClient,
                tileKey('cancelled-out'),
                new Promise<string>((resolve) => {
                    responses.push(resolve);
                }),
                signal,
            );
        queryClient.setQueryData(tileKey('cancelled-out'), 'old');
        const unmount = new QueryObserver(queryClient, {
            queryKey: tileKey('cancelled-out'),
            queryFn: () => 'unused',
            staleTime: Infinity,
        }).subscribe(() => {});
        // A request left on the wire by a fetch cancelled at a tab switch
        const controller = new AbortController();
        const leftover = send(controller.signal);
        controller.abort();
        let freeSlot: () => void = () => {};
        const slot = new Promise<void>((resolve) => {
            freeSlot = resolve;
        });
        const queued = queryClient.fetchQuery({
            queryKey: tileKey('cancelled-out'),
            queryFn: async () => {
                await slot;
                return send();
            },
        });
        evictSavedDashboardResults(queryClient);

        responses[0]('leftover');
        await leftover;
        freeSlot();
        await flush();
        responses[1]('post-save');
        await queued;
        await flush();

        expect(responses).toHaveLength(2);
        unmount();
    });
});
