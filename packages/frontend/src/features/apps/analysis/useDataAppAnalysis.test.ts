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

const render = () =>
    renderHook(
        ({ appUuid }: { appUuid: string }) =>
            useDataAppAnalysis({
                projectUuid: 'proj-1',
                appUuid,
                queries: [readyQuery],
                mountedQueryUuids: null,
            }),
        { initialProps: { appUuid: 'app-a' } },
    );

describe('useDataAppAnalysis', () => {
    beforeEach(() => {
        vi.mocked(detectDataAppAnomalies).mockImplementation(
            async ({ appUuid }) => analysis(appUuid),
        );
        vi.mocked(lookupDataAppAnalysis).mockResolvedValue(null);
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
        await act(async () => {});
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
        await act(async () => {});
        expect(result.current.state.status).toBe('idle');
        await act(async () => {
            await result.current.analyse();
        });
        expect(detectDataAppAnomalies).toHaveBeenCalledWith(
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
