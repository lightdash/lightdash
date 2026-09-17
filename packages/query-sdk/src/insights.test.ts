import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    EMPTY_INSIGHTS,
    INSIGHTS_MESSAGE,
    INSIGHTS_REQUEST_MESSAGE,
    INSIGHT_ACTION_MESSAGE,
    MOUNTED_QUERIES_MESSAGE,
    mountInsights,
    parseInsightsPayload,
    peekHostAiAvailable,
    peekInsights,
    postInsightAction,
    registerMountedQuery,
    resetInsightsState,
    rowMatchesInsight,
    type InsightsPayload,
} from './insights';

const anomaly = {
    id: 'a1',
    severity: 'high' as const,
    text: 'Returns spiked',
    queryUuid: 'q1',
    fieldId: 'orders_total',
    dimensionValues: { orders_status: 'returned' },
    expected: null,
    actual: '12',
    investigation: {
        status: 'idle' as const,
        explanation: null,
        partial: false,
        threadUuid: null,
        error: null,
    },
};

const payload: InsightsPayload = {
    ...EMPTY_INSIGHTS,
    status: 'ready',
    analysisId: 'an-1',
    headline: 'Returns doubled',
    summary: 'Returned orders rose to 12.',
    canInvestigate: true,
    canContinue: true,
    anomalies: [anomaly, { ...anomaly, id: 'a2', queryUuid: 'q2' }],
};

const dispatch = (source: Window, data: unknown) =>
    window.dispatchEvent(new MessageEvent('message', { data, source }));

describe('insights channel', () => {
    let host: Window;
    let posted: unknown[];

    beforeEach(() => {
        resetInsightsState();
        posted = [];
        host = { postMessage: (m: unknown) => posted.push(m) } as never;
    });
    afterEach(() => resetInsightsState());

    it('requests the current analysis on mount and again on sdk:ready', () => {
        mountInsights(host);
        expect(posted).toContainEqual({ type: INSIGHTS_REQUEST_MESSAGE });
        posted.length = 0;
        dispatch(host, { type: 'lightdash:sdk:ready' });
        expect(posted).toContainEqual({ type: INSIGHTS_REQUEST_MESSAGE });
    });

    it('is unavailable until the host pushes, then stores the payload', () => {
        mountInsights(host);
        expect(peekInsights().status).toBe('unavailable');
        dispatch(host, { type: INSIGHTS_MESSAGE, payload });
        expect(peekInsights().headline).toBe('Returns doubled');
        expect(peekInsights().anomalies).toHaveLength(2);
    });

    it('reports host AI availability only once the host has pushed', () => {
        mountInsights(host);
        expect(peekHostAiAvailable()).toBe(false);
        dispatch(host, {
            type: INSIGHTS_MESSAGE,
            payload: { ...payload, status: 'unavailable' },
        });
        expect(peekHostAiAvailable()).toBe(false);
        dispatch(host, { type: INSIGHTS_MESSAGE, payload });
        expect(peekHostAiAvailable()).toBe(true);
    });

    it('ignores other windows and malformed payloads', () => {
        mountInsights(host);
        dispatch({} as Window, { type: INSIGHTS_MESSAGE, payload });
        dispatch(host, {
            type: INSIGHTS_MESSAGE,
            payload: { ...payload, anomalies: [{ id: 1 }] },
        });
        expect(peekInsights().status).toBe('unavailable');
    });

    it('posts actions to the host', () => {
        mountInsights(host);
        posted.length = 0;
        postInsightAction({ action: 'analyse' });
        postInsightAction({ action: 'investigate', anomalyId: 'a1' });
        postInsightAction({ action: 'continue', anomalyId: 'a1' });
        expect(posted).toEqual([
            { type: INSIGHT_ACTION_MESSAGE, action: 'analyse' },
            {
                type: INSIGHT_ACTION_MESSAGE,
                action: 'investigate',
                anomalyId: 'a1',
            },
            {
                type: INSIGHT_ACTION_MESSAGE,
                action: 'continue',
                anomalyId: 'a1',
            },
        ]);
    });

    it('keeps posting to the host after a remount', () => {
        mountInsights(host);
        mountInsights(host);
        posted.length = 0;
        postInsightAction({ action: 'analyse' });
        expect(posted).toEqual([
            { type: INSIGHT_ACTION_MESSAGE, action: 'analyse' },
        ]);
    });

    it('reports mounted queries, coalesced per tick', async () => {
        mountInsights(host);
        posted.length = 0;
        const unregisterA = registerMountedQuery('q1');
        registerMountedQuery('q2');
        await vi.waitFor(() =>
            expect(posted.at(-1)).toEqual({
                type: MOUNTED_QUERIES_MESSAGE,
                queryUuids: ['q1', 'q2'],
            }),
        );
        expect(
            posted.filter(
                (m) => (m as { type: string }).type === MOUNTED_QUERIES_MESSAGE,
            ),
        ).toHaveLength(1);
        unregisterA();
        await vi.waitFor(() =>
            expect(posted.at(-1)).toEqual({
                type: MOUNTED_QUERIES_MESSAGE,
                queryUuids: ['q2'],
            }),
        );
    });

    it('matches rows on raw or formatted dimension values', () => {
        const dims = { orders_status: 'returned', orders_date: '2025-01-03' };
        expect(
            rowMatchesInsight(
                { orders_status: 'returned', orders_date: '2025-01-03' },
                dims,
            ),
        ).toBe(true);
        expect(
            rowMatchesInsight(
                {
                    orders_status: 'returned',
                    orders_date: '2025-01-03T00:00:00.000Z',
                },
                dims,
                (row, fieldId) =>
                    fieldId === 'orders_date'
                        ? String(row[fieldId]).slice(0, 10)
                        : String(row[fieldId]),
            ),
        ).toBe(true);
        expect(rowMatchesInsight({ orders_status: 'shipped' }, dims)).toBe(
            false,
        );
    });

    it('treats a missing row as no match instead of throwing', () => {
        const dims = { orders_status: 'returned' };
        expect(rowMatchesInsight(undefined, dims)).toBe(false);
        expect(rowMatchesInsight(null, dims)).toBe(false);
    });

    it('never matches a whole-table finding to a row', () => {
        expect(rowMatchesInsight({ orders_status: 'returned' }, {})).toBe(
            false,
        );
    });

    it('matches rows keyed by the app short names through rowKeys', () => {
        const dims = { orders_order_date_month: '2025-01-01' };
        const rowKeys = { orders_order_date_month: 'order_date_month' };
        expect(
            rowMatchesInsight({ order_date_month: '2025-01-01' }, dims),
        ).toBe(false);
        expect(
            rowMatchesInsight(
                { order_date_month: '2025-01-01' },
                dims,
                undefined,
                rowKeys,
            ),
        ).toBe(true);
    });

    it('parses a full payload and rejects the wrong shape', () => {
        expect(parseInsightsPayload(payload)).toEqual(payload);
        expect(parseInsightsPayload({ status: 'ready' })).toBeNull();
        expect(
            parseInsightsPayload({ ...payload, status: 'weird' }),
        ).toBeNull();
    });
});
