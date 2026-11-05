import { DashboardTileTypes, type DashboardTile } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { type DashboardStoreState } from '.';
import { selectDashboardAnalysisSources } from './analysisSourceSelectors';
import { type TileQueryRegistration } from './dashboardTileStatusReducer';

const chartTile = (
    uuid: string,
    tabUuid: string | undefined,
    title = '',
): DashboardTile =>
    ({
        uuid,
        tabUuid,
        type: DashboardTileTypes.SAVED_CHART,
        properties: { savedChartUuid: `chart-${uuid}`, title },
        x: 0,
        y: 0,
        h: 1,
        w: 1,
    }) as unknown as DashboardTile;

const markdownTile = (uuid: string): DashboardTile =>
    ({
        uuid,
        tabUuid: undefined,
        type: DashboardTileTypes.MARKDOWN,
        properties: { title: 'Notes', content: '' },
        x: 0,
        y: 0,
        h: 1,
        w: 1,
    }) as unknown as DashboardTile;

const tab = (uuid: string, hidden = false) => ({
    uuid,
    name: uuid,
    order: 0,
    hidden,
});

const buildState = ({
    tiles,
    tabs = [],
    activeTabUuid,
    tileQueries = {},
}: {
    tiles: DashboardTile[];
    tabs?: ReturnType<typeof tab>[];
    activeTabUuid?: string;
    tileQueries?: Record<string, TileQueryRegistration>;
}): DashboardStoreState =>
    ({
        edit: {
            tiles,
            tabs,
            activeTab: activeTabUuid
                ? tabs.find((t) => t.uuid === activeTabUuid)
                : undefined,
        },
        tileStatus: { tileQueries },
    }) as unknown as DashboardStoreState;

const ready = (
    tileUuid: string,
    queryUuid: string,
    label = 'Chart',
): TileQueryRegistration => ({
    tileUuid,
    queryUuid,
    label,
    status: 'ready',
});

describe('selectDashboardAnalysisSources', () => {
    it('collects ready registrations of chart tiles and ignores layout tiles', () => {
        const state = buildState({
            tiles: [chartTile('t1', undefined), markdownTile('t2')],
            tileQueries: { t1: ready('t1', 'q1', 'Orders') },
        });
        expect(selectDashboardAnalysisSources(state)).toEqual({
            sources: [{ queryUuid: 'q1', label: 'Orders' }],
            inFlight: false,
        });
    });

    it('is in flight while an analysable tile has not reported', () => {
        const state = buildState({
            tiles: [chartTile('t1', undefined), chartTile('t2', undefined)],
            tileQueries: { t1: ready('t1', 'q1') },
        });
        expect(selectDashboardAnalysisSources(state)).toEqual({
            sources: [{ queryUuid: 'q1', label: 'Chart' }],
            inFlight: true,
        });
    });

    it('an error registration settles the tile without adding a source', () => {
        const state = buildState({
            tiles: [chartTile('t1', undefined), chartTile('t2', undefined)],
            tileQueries: {
                t1: ready('t1', 'q1'),
                t2: {
                    tileUuid: 't2',
                    queryUuid: null,
                    label: 'Broken',
                    status: 'error',
                },
            },
        });
        expect(selectDashboardAnalysisSources(state)).toEqual({
            sources: [{ queryUuid: 'q1', label: 'Chart' }],
            inFlight: false,
        });
    });

    it('dedupes duplicate tiles sharing one queryUuid', () => {
        const state = buildState({
            tiles: [chartTile('t1', undefined), chartTile('t2', undefined)],
            tileQueries: {
                t1: ready('t1', 'q1', 'Orders'),
                t2: ready('t2', 'q1', 'Orders copy'),
            },
        });
        expect(selectDashboardAnalysisSources(state).sources).toEqual([
            { queryUuid: 'q1', label: 'Orders' },
        ]);
    });

    it('keeps only the active tab and never a hidden tab', () => {
        const tabs = [tab('tab-a'), tab('tab-b'), tab('tab-hidden', true)];
        const state = buildState({
            tiles: [
                chartTile('t1', 'tab-a'),
                chartTile('t2', 'tab-b'),
                chartTile('t3', 'tab-hidden'),
            ],
            tabs,
            activeTabUuid: 'tab-b',
            tileQueries: {
                t1: ready('t1', 'q1'),
                t2: ready('t2', 'q2'),
                t3: ready('t3', 'q3'),
            },
        });
        expect(selectDashboardAnalysisSources(state)).toEqual({
            sources: [{ queryUuid: 'q2', label: 'Chart' }],
            inFlight: false,
        });
    });

    it('renders stale-tab tiles on the default tab only', () => {
        const tabs = [tab('tab-a'), tab('tab-b')];
        const orphan = chartTile('t9', 'tab-deleted');
        const onDefault = buildState({
            tiles: [chartTile('t1', 'tab-a'), orphan],
            tabs,
            activeTabUuid: 'tab-a',
            tileQueries: {
                t1: ready('t1', 'q1'),
                t9: ready('t9', 'q9'),
            },
        });
        expect(
            selectDashboardAnalysisSources(onDefault).sources.map(
                (s) => s.queryUuid,
            ),
        ).toEqual(['q1', 'q9']);
        const onOther = buildState({
            tiles: [chartTile('t2', 'tab-b'), orphan],
            tabs,
            activeTabUuid: 'tab-b',
            tileQueries: {
                t2: ready('t2', 'q2'),
                t9: ready('t9', 'q9'),
            },
        });
        expect(
            selectDashboardAnalysisSources(onOther).sources.map(
                (s) => s.queryUuid,
            ),
        ).toEqual(['q2']);
    });

    it('includes every tile when tabs are not enabled (single visible tab)', () => {
        const tabs = [tab('tab-a'), tab('tab-hidden', true)];
        const state = buildState({
            tiles: [chartTile('t1', 'tab-a'), chartTile('t2', 'tab-hidden')],
            tabs,
            activeTabUuid: 'tab-a',
            tileQueries: {
                t1: ready('t1', 'q1'),
                t2: ready('t2', 'q2'),
            },
        });
        // One visible tab means the tab bar is off; the whole grid renders.
        expect(
            selectDashboardAnalysisSources(state).sources.map(
                (s) => s.queryUuid,
            ),
        ).toEqual(['q1', 'q2']);
    });
});
