import {
    DashboardTileTypes,
    type DashboardAiSummaryTile,
    type DashboardTile,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { type TileQueryRegistration } from '../dashboard/store/dashboardTileStatusReducer';
import { getAiSummarySources } from './aiSummarySources';

const position = { x: 0, y: 0, w: 12, h: 6 };

const chartTile = (uuid: string, tabUuid: string | null): DashboardTile => ({
    ...position,
    uuid,
    tabUuid,
    type: DashboardTileTypes.SAVED_CHART,
    properties: { savedChartUuid: `chart-${uuid}` },
});

const markdownTile = (uuid: string, tabUuid: string | null): DashboardTile => ({
    ...position,
    uuid,
    tabUuid,
    type: DashboardTileTypes.MARKDOWN,
    properties: { title: 'Notes', content: '' },
});

const summaryTile = (
    tabUuid: string | null,
    scope: DashboardAiSummaryTile['properties']['scope'],
): DashboardAiSummaryTile => ({
    ...position,
    uuid: 'summary',
    tabUuid,
    type: DashboardTileTypes.AI_SUMMARY,
    properties: { title: 'AI summary', instructions: null, scope },
});

const ready = (tileUuid: string, queryUuid: string): TileQueryRegistration => ({
    tileUuid,
    queryUuid,
    label: tileUuid,
    status: 'ready',
});

describe('getAiSummarySources', () => {
    const tiles = [
        chartTile('a', 'tab-1'),
        chartTile('b', 'tab-1'),
        chartTile('c', 'tab-2'),
        markdownTile('notes', 'tab-1'),
    ];

    it('reads only the charts on the summary tile tab', () => {
        const result = getAiSummarySources(
            summaryTile('tab-1', { type: 'tab' }),
            tiles,
            {
                a: ready('a', 'q-a'),
                b: ready('b', 'q-b'),
                c: ready('c', 'q-c'),
            },
        );

        expect(result.sources.map((s) => s.queryUuid)).toEqual(['q-a', 'q-b']);
        expect(result.charts).toHaveLength(2);
        expect(result.inFlight).toBe(false);
    });

    it('reads only the charts the author picked', () => {
        const result = getAiSummarySources(
            summaryTile('tab-1', { type: 'tiles', tileUuids: ['b'] }),
            tiles,
            { a: ready('a', 'q-a'), b: ready('b', 'q-b') },
        );

        expect(result.sources.map((s) => s.queryUuid)).toEqual(['q-b']);
        expect(result.charts).toHaveLength(1);
    });

    it('does not wait for a picked chart that sits on another tab', () => {
        const result = getAiSummarySources(
            summaryTile('tab-1', { type: 'tiles', tileUuids: ['a', 'c'] }),
            tiles,
            { a: ready('a', 'q-a') },
        );

        expect(result.sources.map((s) => s.queryUuid)).toEqual(['q-a']);
        expect(result.charts).toHaveLength(1);
        expect(result.inFlight).toBe(false);
    });

    it('waits while a chart in scope is still loading', () => {
        const result = getAiSummarySources(
            summaryTile('tab-1', { type: 'tab' }),
            tiles,
            { a: ready('a', 'q-a') },
        );

        expect(result.inFlight).toBe(true);
    });

    it('leaves out a chart that failed instead of waiting for it', () => {
        const result = getAiSummarySources(
            summaryTile('tab-1', { type: 'tab' }),
            tiles,
            {
                a: ready('a', 'q-a'),
                b: {
                    tileUuid: 'b',
                    queryUuid: null,
                    label: 'b',
                    status: 'error',
                },
            },
        );

        expect(result.sources.map((s) => s.queryUuid)).toEqual(['q-a']);
        expect(result.inFlight).toBe(false);
    });

    it('counts a chart added twice as one source', () => {
        const result = getAiSummarySources(
            summaryTile('tab-1', { type: 'tab' }),
            tiles,
            { a: ready('a', 'q-same'), b: ready('b', 'q-same') },
        );

        expect(result.sources).toHaveLength(1);
    });

    it('has nothing to read when a picked chart was removed', () => {
        const result = getAiSummarySources(
            summaryTile('tab-1', { type: 'tiles', tileUuids: ['gone'] }),
            tiles,
            {},
        );

        expect(result.charts).toHaveLength(0);
        expect(result.inFlight).toBe(false);
    });
});
