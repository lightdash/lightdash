import { act, renderHook } from '@testing-library/react';
import { detectAnalysisAnomalies, lookupAnalysis } from '../../analysis/api';
import { type QueryEvent } from '../hooks/useAppSdkBridge';
import { useDataAppAnalysis } from './useDataAppAnalysis';

vi.mock('../../analysis/api', () => ({
    detectAnalysisAnomalies: vi.fn(),
    investigateAnalysisAnomaly: vi.fn(),
    lookupAnalysis: vi.fn(),
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
    target: { kind: 'app' as const, appUuid, appVersion: 1 },
    sources: [{ queryUuid: 'q-1', label: 'Orders' }],
    generatedAt: new Date(),
    headline: `Headline for ${appUuid}`,
    summary: 'Summary',
    anomalies: [],
    limitations: [],
    dataAsOf: null,
    investigations: [],
});

const render = () =>
    renderHook(
        ({ appUuid }: { appUuid: string }) =>
            useDataAppAnalysis({
                projectUuid: 'proj-1',
                appUuid,
                queries: [readyQuery],
                mountedQueryUuids: null,
                enabled: true,
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
        vi.mocked(detectAnalysisAnomalies).mockImplementation(
            async (_lightdashApi, { target }) =>
                analysis(target.kind === 'app' ? target.appUuid : ''),
        );
        vi.mocked(lookupAnalysis).mockResolvedValue(null);
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('makes no request at all until analysis is available', async () => {
        const { rerender } = renderHook(
            ({ enabled }: { enabled: boolean }) =>
                useDataAppAnalysis({
                    projectUuid: 'proj-1',
                    appUuid: 'app-a',
                    queries: [readyQuery],
                    mountedQueryUuids: null,
                    enabled,
                }),
            { initialProps: { enabled: false } },
        );
        await settle();
        expect(lookupAnalysis).not.toHaveBeenCalled();
        expect(detectAnalysisAnomalies).not.toHaveBeenCalled();

        rerender({ enabled: true });
        await settle();
        expect(lookupAnalysis).toHaveBeenCalledTimes(1);
        expect(detectAnalysisAnomalies).not.toHaveBeenCalled();
    });

    it('sends instructions with lookup and detect, and re-looks-up when they change', async () => {
        const { result, rerender } = renderHook(
            ({ instructions }: { instructions: string | null }) =>
                useDataAppAnalysis({
                    projectUuid: 'proj-1',
                    appUuid: 'app-a',
                    queries: [readyQuery],
                    mountedQueryUuids: null,
                    enabled: true,
                    instructions,
                }),
            { initialProps: { instructions: 'Use British English.' } },
        );
        await settle();
        expect(lookupAnalysis).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                instructions: 'Use British English.',
            }),
        );
        await act(async () => {
            await result.current.analyse();
        });
        expect(detectAnalysisAnomalies).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                instructions: 'Use British English.',
            }),
        );
        expect(result.current.state.status).toBe('ready');
        if (result.current.state.status === 'ready') {
            expect(result.current.state.stale).toBe(false);
        }

        // Changed instructions: a stored analysis of identical rows under the
        // old guidance must not be reused — the view is stale and looked up anew.
        rerender({ instructions: 'Amounts are EUR.' });
        expect(result.current.state.status).toBe('ready');
        if (result.current.state.status === 'ready') {
            expect(result.current.state.stale).toBe(true);
        }
        await settle();
        expect(lookupAnalysis).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ instructions: 'Amounts are EUR.' }),
        );
        expect(lookupAnalysis).toHaveBeenCalledTimes(2);
    });

    it('drops a lookup response that arrives after the view changed', async () => {
        const resolvers: ((v: unknown) => void)[] = [];
        vi.mocked(lookupAnalysis).mockImplementation(
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
                    enabled: true,
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
                    enabled: true,
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
        expect(lookupAnalysis).toHaveBeenCalledTimes(1);
        expect(lookupAnalysis).toHaveBeenCalledWith(
            expect.anything(),
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
        vi.mocked(lookupAnalysis).mockResolvedValue({
            analysis: stored,
            investigations: [
                {
                    investigationId: 'inv-1',
                    analysisId: stored.analysisId,
                    target: {
                        kind: 'app' as const,
                        appUuid: 'app-a',
                        appVersion: 1,
                    },
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
        expect(detectAnalysisAnomalies).not.toHaveBeenCalled();
        expect(lookupAnalysis).toHaveBeenCalledTimes(1);

        // Analysing a view that already shows a current analysis regenerates.
        await act(async () => {
            await result.current.analyse();
        });
        expect(detectAnalysisAnomalies).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ force: true }),
        );
    });

    it('restores stored investigations when detect serves a cached analysis', async () => {
        const cached = analysis('app-a');
        vi.mocked(detectAnalysisAnomalies).mockResolvedValue({
            ...cached,
            investigations: [
                {
                    investigationId: 'inv-1',
                    analysisId: cached.analysisId,
                    target: {
                        kind: 'app' as const,
                        appUuid: 'app-a',
                        appVersion: 1,
                    },
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
        await act(async () => {
            await result.current.analyse();
        });
        expect(result.current.state.status).toBe('ready');
        expect(result.current.investigations['anom-1']?.status).toBe('ready');
    });

    it('stays idle on a lookup miss and does not force the first run', async () => {
        const { result } = render();
        await settle();
        expect(result.current.state.status).toBe('idle');
        expect(detectAnalysisAnomalies).not.toHaveBeenCalled();
        await act(async () => {
            await result.current.analyse();
        });
        expect(detectAnalysisAnomalies).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ force: false }),
        );
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
        vi.mocked(detectAnalysisAnomalies).mockImplementation(
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
                    enabled: true,
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
        expect(detectAnalysisAnomalies).toHaveBeenLastCalledWith(
            expect.anything(),
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
            vi.mocked(detectAnalysisAnomalies)
                .mockRejectedValueOnce(expired)
                .mockImplementation(async (_lightdashApi, { target }) =>
                    analysis(target.kind === 'app' ? target.appUuid : ''),
                );
            const onSourcesExpired = vi.fn();
            const { result, rerender } = renderHook(
                ({ queries }: { queries: QueryEvent[] }) =>
                    useDataAppAnalysis({
                        projectUuid: 'proj-1',
                        appUuid: 'app-a',
                        queries,
                        mountedQueryUuids: null,
                        enabled: true,
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
            expect(detectAnalysisAnomalies).toHaveBeenCalledTimes(2);
            expect(detectAnalysisAnomalies).toHaveBeenLastCalledWith(
                expect.anything(),
                expect.objectContaining({
                    sources: [{ queryUuid: 'q-2', label: 'Orders' }],
                    force: false,
                }),
            );
            expect(result.current.state.status).toBe('ready');
        });

        it('gives up with a distinct error when the fresh view expires too', async () => {
            vi.mocked(detectAnalysisAnomalies).mockRejectedValue(expired);
            const onSourcesExpired = vi.fn();
            const { result, rerender } = renderHook(
                ({ queries }: { queries: QueryEvent[] }) =>
                    useDataAppAnalysis({
                        projectUuid: 'proj-1',
                        appUuid: 'app-a',
                        queries,
                        mountedQueryUuids: null,
                        enabled: true,
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
            expect(detectAnalysisAnomalies).toHaveBeenCalledTimes(2);
            expect(result.current.state).toMatchObject({
                status: 'error',
                message: expect.stringMatching(/expired/),
            });
        });

        it('consumes the retry when the fresh view has a stored analysis', async () => {
            vi.mocked(detectAnalysisAnomalies).mockRejectedValueOnce(expired);
            const { result, rerender } = renderHook(
                ({ queries }: { queries: QueryEvent[] }) =>
                    useDataAppAnalysis({
                        projectUuid: 'proj-1',
                        appUuid: 'app-a',
                        queries,
                        mountedQueryUuids: null,
                        enabled: true,
                        onSourcesExpired: vi.fn(),
                    }),
                { initialProps: { queries: [readyQuery] } },
            );
            await settle();
            await act(async () => {
                await result.current.analyse();
            });
            vi.mocked(lookupAnalysis).mockResolvedValueOnce({
                analysis: analysis('app-a'),
                investigations: [],
            });
            rerender({ queries: reloadedQueries });
            await settle();
            expect(result.current.state.status).toBe('ready');
            expect(detectAnalysisAnomalies).toHaveBeenCalledTimes(1);

            // A later filter change that misses must not analyse on its own.
            rerender({
                queries: [{ ...readyQuery, id: 'req-3', queryUuid: 'q-3' }],
            });
            await settle();
            expect(detectAnalysisAnomalies).toHaveBeenCalledTimes(1);
        });

        it('forgets the retry when the app changes', async () => {
            vi.mocked(detectAnalysisAnomalies).mockRejectedValueOnce(expired);
            const { result, rerender } = renderHook(
                ({ appUuid }: { appUuid: string }) =>
                    useDataAppAnalysis({
                        projectUuid: 'proj-1',
                        appUuid,
                        queries: [readyQuery],
                        mountedQueryUuids: null,
                        enabled: true,
                        onSourcesExpired: vi.fn(),
                    }),
                { initialProps: { appUuid: 'app-a' } },
            );
            await settle();
            await act(async () => {
                await result.current.analyse();
            });
            rerender({ appUuid: 'app-b' });
            await settle();
            expect(result.current.state.status).toBe('idle');
            expect(detectAnalysisAnomalies).toHaveBeenCalledTimes(1);
        });

        it('reports the second expiry when the reloaded lookup expires', async () => {
            vi.mocked(detectAnalysisAnomalies).mockRejectedValueOnce(expired);
            const { result, rerender } = renderHook(
                ({ queries }: { queries: QueryEvent[] }) =>
                    useDataAppAnalysis({
                        projectUuid: 'proj-1',
                        appUuid: 'app-a',
                        queries,
                        mountedQueryUuids: null,
                        enabled: true,
                        onSourcesExpired: vi.fn(),
                    }),
                { initialProps: { queries: [readyQuery] } },
            );
            await settle();
            await act(async () => {
                await result.current.analyse();
            });
            vi.mocked(lookupAnalysis).mockRejectedValueOnce(expired);
            rerender({ queries: reloadedQueries });
            await settle();
            expect(detectAnalysisAnomalies).toHaveBeenCalledTimes(1);
            expect(result.current.state).toMatchObject({
                status: 'error',
                message: expect.stringMatching(/expired/),
            });
        });

        it('still swallows an expired lookup outside a retry', async () => {
            vi.mocked(lookupAnalysis).mockRejectedValueOnce(expired);
            const { result } = render();
            await settle();
            expect(result.current.state.status).toBe('idle');
        });

        it('is a plain error where the host cannot reload the app', async () => {
            vi.mocked(detectAnalysisAnomalies).mockRejectedValue(expired);
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
        vi.mocked(detectAnalysisAnomalies).mockImplementation(
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
