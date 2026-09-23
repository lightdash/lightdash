import { act, renderHook } from '@testing-library/react';
import { type QueryEvent } from '../hooks/useAppSdkBridge';
import { detectDataAppAnomalies, lookupDataAppAnalysis } from './api';
import { useDataAppAnalysis } from './useDataAppAnalysis';

vi.mock('./api', () => ({
    detectDataAppAnomalies: vi.fn(),
    investigateDataAppAnomaly: vi.fn(),
    lookupDataAppAnalysis: vi.fn(),
}));

const readyQuery: QueryEvent = {
    id: 'req-1',
    timestamp: 1,
    label: 'Orders',
    exploreName: 'orders',
    dimensions: [],
    metrics: [],
    filters: null,
    sorts: [],
    tableCalculations: [],
    additionalMetrics: [],
    limit: 500,
    queryUuid: 'q-1',
    status: 'ready',
    rowCount: 1,
    durationMs: 1,
    error: null,
    rawMetricQuery: { exploreName: 'orders', metrics: ['orders_count'] },
};

const analysis = (appUuid: string) => ({
    analysisId: `analysis-${appUuid}`,
    appUuid,
    appVersion: 1,
    sources: [{ queryUuid: 'q-1', label: 'Orders' }],
    generatedAt: new Date(),
    headline: `Headline for ${appUuid}`,
    summary: 'Summary',
    anomalies: [],
    limitations: [],
    dataAsOf: null,
});

const render = (autoAnalyse = false) =>
    renderHook(
        ({ appUuid }: { appUuid: string }) =>
            useDataAppAnalysis({
                projectUuid: 'proj-1',
                appUuid,
                queries: [readyQuery],
                mountedQueryUuids: null,
                autoAnalyse,
            }),
        { initialProps: { appUuid: 'app-a' } },
    );

const settle = () =>
    act(async () => {
        await vi.advanceTimersByTimeAsync(500);
    });

describe('useDataAppAnalysis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.mocked(detectDataAppAnomalies).mockImplementation(
            async ({ appUuid }) => analysis(appUuid),
        );
        vi.mocked(lookupDataAppAnalysis).mockResolvedValue(null);
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('drops a lookup response that arrives after the view changed', async () => {
        const resolvers: ((v: unknown) => void)[] = [];
        vi.mocked(lookupDataAppAnalysis).mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolvers.push(resolve as (v: unknown) => void);
                }),
        );
        const { result, rerender } = renderHook(
            ({ queries }: { queries: QueryEvent[] }) =>
                useDataAppAnalysis({
                    projectUuid: 'proj-1',
                    appUuid: 'app-a',
                    queries,
                    mountedQueryUuids: null,
                }),
            { initialProps: { queries: [readyQuery] } },
        );
        await settle();
        rerender({
            queries: [{ ...readyQuery, id: 'req-2', queryUuid: 'q-2' }],
        });
        await settle();
        expect(resolvers).toHaveLength(2);
        // View A's lookup resolves after view B replaced it.
        await act(async () => {
            resolvers[0]({ analysis: analysis('app-a'), investigations: [] });
        });
        expect(result.current.state.status).toBe('idle');
        await act(async () => {
            resolvers[1]({ analysis: analysis('app-a'), investigations: [] });
        });
        expect(result.current.state.status).toBe('ready');
    });

    it('looks up once after the view goes quiet', async () => {
        const { rerender } = renderHook(
            ({ queries }: { queries: QueryEvent[] }) =>
                useDataAppAnalysis({
                    projectUuid: 'proj-1',
                    appUuid: 'app-a',
                    queries,
                    mountedQueryUuids: null,
                }),
            { initialProps: { queries: [readyQuery] } },
        );
        await act(async () => {
            await vi.advanceTimersByTimeAsync(100);
        });
        rerender({
            queries: [
                readyQuery,
                {
                    ...readyQuery,
                    id: 'req-2',
                    queryUuid: 'q-2',
                    rawMetricQuery: {
                        exploreName: 'payments',
                        metrics: ['payments_total'],
                    },
                },
            ],
        });
        await settle();
        expect(lookupDataAppAnalysis).toHaveBeenCalledTimes(1);
        expect(lookupDataAppAnalysis).toHaveBeenCalledWith(
            expect.objectContaining({
                sources: [
                    { queryUuid: 'q-1', label: 'Orders' },
                    { queryUuid: 'q-2', label: 'Orders' },
                ],
            }),
        );
    });

    it('opens with a stored analysis and its investigations when one exists', async () => {
        const stored = analysis('app-a');
        vi.mocked(lookupDataAppAnalysis).mockResolvedValue({
            analysis: stored,
            investigations: [
                {
                    investigationId: 'inv-1',
                    analysisId: stored.analysisId,
                    appUuid: 'app-a',
                    appVersion: 1,
                    generatedAt: new Date(),
                    explanation: 'because',
                    anomaly: {
                        id: 'anom-1',
                        severity: 'high',
                        text: 't',
                        queryUuid: 'q-1',
                        fieldId: 'orders_count',
                        dimensionValues: {},
                        expected: null,
                        actual: '1',
                    },
                    agentUuid: 'agent-1',
                    threadUuid: 'thread-1',
                    queriesRun: 2,
                    partial: false,
                },
            ],
        });
        const { result } = render();
        await settle();
        expect(result.current.state.status).toBe('ready');
        expect(result.current.investigations['anom-1']?.status).toBe('ready');
        expect(detectDataAppAnomalies).not.toHaveBeenCalled();
        expect(lookupDataAppAnalysis).toHaveBeenCalledTimes(1);

        // Analysing a view that already shows a current analysis regenerates.
        await act(async () => {
            await result.current.analyse();
        });
        expect(detectDataAppAnomalies).toHaveBeenCalledWith(
            expect.objectContaining({ force: true }),
        );
    });

    it('stays idle on a lookup miss and does not force the first run', async () => {
        const { result } = render();
        await settle();
        expect(result.current.state.status).toBe('idle');
        await act(async () => {
            await result.current.analyse();
        });
        expect(detectDataAppAnomalies).toHaveBeenCalledWith(
            expect.objectContaining({ force: false }),
        );
    });

    it('runs detect on a lookup miss when the app analyses on load', async () => {
        const { result } = render(true);
        await settle();
        expect(lookupDataAppAnalysis).toHaveBeenCalledTimes(1);
        expect(detectDataAppAnomalies).toHaveBeenCalledTimes(1);
        expect(detectDataAppAnomalies).toHaveBeenCalledWith(
            expect.objectContaining({ appUuid: 'app-a', force: false }),
        );
        expect(result.current.state.status).toBe('ready');
    });

    it('does not run detect on load when a stored analysis exists', async () => {
        vi.mocked(lookupDataAppAnalysis).mockResolvedValue({
            analysis: analysis('app-a'),
            investigations: [],
        });
        const { result } = render(true);
        await settle();
        expect(detectDataAppAnomalies).not.toHaveBeenCalled();
        expect(result.current.state.status).toBe('ready');
    });

    it('re-runs detect once when the view changes and nothing is stored', async () => {
        const { result, rerender } = renderHook(
            ({ queries }: { queries: QueryEvent[] }) =>
                useDataAppAnalysis({
                    projectUuid: 'proj-1',
                    appUuid: 'app-a',
                    queries,
                    mountedQueryUuids: null,
                    autoAnalyse: true,
                }),
            { initialProps: { queries: [readyQuery] } },
        );
        await settle();
        expect(detectDataAppAnomalies).toHaveBeenCalledTimes(1);
        rerender({
            queries: [
                readyQuery,
                { ...readyQuery, id: 'req-2', timestamp: 2, queryUuid: 'q-2' },
            ],
        });
        expect(result.current.state).toMatchObject({
            status: 'ready',
            stale: true,
        });
        await settle();
        expect(detectDataAppAnomalies).toHaveBeenCalledTimes(2);
        expect(result.current.state).toMatchObject({
            status: 'ready',
            stale: false,
        });
    });

    it('drops a finished analysis when the app changes', async () => {
        const { result, rerender } = render();
        await act(async () => {
            await result.current.analyse();
        });
        expect(result.current.state.status).toBe('ready');

        rerender({ appUuid: 'app-b' });
        expect(result.current.state.status).toBe('idle');
        expect(result.current.investigations).toEqual({});
    });

    it('shows the analysis of the current view when an older detect resolves late', async () => {
        const resolvers: ((v: ReturnType<typeof analysis>) => void)[] = [];
        vi.mocked(detectDataAppAnomalies).mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolvers.push(resolve);
                }),
        );
        const { result, rerender } = renderHook(
            ({ queries }: { queries: QueryEvent[] }) =>
                useDataAppAnalysis({
                    projectUuid: 'proj-1',
                    appUuid: 'app-a',
                    queries,
                    mountedQueryUuids: null,
                }),
            { initialProps: { queries: [readyQuery] } },
        );
        await settle();
        // Detect A on view A; the filters change; detect B on view B.
        act(() => {
            void result.current.analyse();
        });
        rerender({
            queries: [{ ...readyQuery, id: 'req-2', queryUuid: 'q-2' }],
        });
        await settle();
        act(() => {
            void result.current.analyse();
        });
        expect(resolvers).toHaveLength(2);
        expect(detectDataAppAnomalies).toHaveBeenLastCalledWith(
            expect.objectContaining({
                sources: [{ queryUuid: 'q-2', label: 'Orders' }],
            }),
        );

        const late = { ...analysis('app-a'), headline: 'View A (late)' };
        const current = { ...analysis('app-a'), headline: 'View B' };
        await act(async () => resolvers[1](current));
        expect(result.current.state).toMatchObject({
            status: 'ready',
            stale: false,
            analysis: { headline: 'View B' },
        });
        await act(async () => resolvers[0](late));
        expect(result.current.state).toMatchObject({
            status: 'ready',
            stale: false,
            analysis: { headline: 'View B' },
        });
    });

    it('auto-runs once per view generation, not once per query event', async () => {
        const { rerender } = renderHook(
            ({ queries }: { queries: QueryEvent[] }) =>
                useDataAppAnalysis({
                    projectUuid: 'proj-1',
                    appUuid: 'app-a',
                    queries,
                    mountedQueryUuids: null,
                    autoAnalyse: true,
                }),
            { initialProps: { queries: [readyQuery] } },
        );
        await settle();
        expect(detectDataAppAnomalies).toHaveBeenCalledTimes(1);
        // Same generation: a re-emitted event and a pending sibling change
        // nothing the analysis keys on.
        rerender({ queries: [{ ...readyQuery, timestamp: 2 }] });
        await settle();
        rerender({
            queries: [
                { ...readyQuery, timestamp: 2 },
                {
                    ...readyQuery,
                    id: 'req-p',
                    queryUuid: null,
                    status: 'pending',
                },
            ],
        });
        await settle();
        expect(detectDataAppAnomalies).toHaveBeenCalledTimes(1);
    });

    describe('expired sources', () => {
        const expired = {
            status: 'error',
            error: {
                statusCode: 410,
                name: 'DataAppSourcesExpiredError',
                message: 'expired',
                data: { code: 'sources_expired' },
            },
        };
        const reloadedQueries: QueryEvent[] = [
            { ...readyQuery, id: 'req-2', timestamp: 2, queryUuid: 'q-2' },
        ];

        it('reloads the app once, then analyses the fresh view', async () => {
            vi.mocked(detectDataAppAnomalies)
                .mockRejectedValueOnce(expired)
                .mockImplementation(async ({ appUuid }) => analysis(appUuid));
            const onSourcesExpired = vi.fn();
            const { result, rerender } = renderHook(
                ({ queries }: { queries: QueryEvent[] }) =>
                    useDataAppAnalysis({
                        projectUuid: 'proj-1',
                        appUuid: 'app-a',
                        queries,
                        mountedQueryUuids: null,
                        onSourcesExpired,
                    }),
                { initialProps: { queries: [readyQuery] } },
            );
            await settle();
            await act(async () => {
                await result.current.analyse();
            });
            expect(onSourcesExpired).toHaveBeenCalledTimes(1);
            expect(result.current.state.status).toBe('idle');

            // The reload re-runs the app's queries under new uuids.
            rerender({ queries: reloadedQueries });
            await settle();
            expect(detectDataAppAnomalies).toHaveBeenCalledTimes(2);
            expect(detectDataAppAnomalies).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    sources: [{ queryUuid: 'q-2', label: 'Orders' }],
                    force: false,
                }),
            );
            expect(result.current.state.status).toBe('ready');
        });

        it('gives up with a distinct error when the fresh view expires too', async () => {
            vi.mocked(detectDataAppAnomalies).mockRejectedValue(expired);
            const onSourcesExpired = vi.fn();
            const { result, rerender } = renderHook(
                ({ queries }: { queries: QueryEvent[] }) =>
                    useDataAppAnalysis({
                        projectUuid: 'proj-1',
                        appUuid: 'app-a',
                        queries,
                        mountedQueryUuids: null,
                        onSourcesExpired,
                    }),
                { initialProps: { queries: [readyQuery] } },
            );
            await settle();
            await act(async () => {
                await result.current.analyse();
            });
            rerender({ queries: reloadedQueries });
            await settle();
            expect(onSourcesExpired).toHaveBeenCalledTimes(1);
            expect(detectDataAppAnomalies).toHaveBeenCalledTimes(2);
            expect(result.current.state).toMatchObject({
                status: 'error',
                message: expect.stringMatching(/expired/),
            });
        });

        it('is a plain error where the host cannot reload the app', async () => {
            vi.mocked(detectDataAppAnomalies).mockRejectedValue(expired);
            const { result } = render();
            await settle();
            await act(async () => {
                await result.current.analyse();
            });
            expect(result.current.state).toMatchObject({
                status: 'error',
                message: expect.stringMatching(/expired/),
            });
        });
    });

    it('ignores a response that arrives after the app changed', async () => {
        let resolve: (value: ReturnType<typeof analysis>) => void = () => {};
        vi.mocked(detectDataAppAnomalies).mockImplementation(
            () =>
                new Promise((r) => {
                    resolve = r;
                }),
        );
        const { result, rerender } = render();
        act(() => {
            void result.current.analyse();
        });
        expect(result.current.state.status).toBe('analysing');

        rerender({ appUuid: 'app-b' });
        expect(result.current.state.status).toBe('idle');
        await act(async () => resolve(analysis('app-a')));
        expect(result.current.state.status).toBe('idle');
    });
});
