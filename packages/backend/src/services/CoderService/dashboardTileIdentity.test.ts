import {
    DashboardTileTypes,
    type DashboardChartTile,
    type DashboardTile,
    type DashboardTileWithSlug,
} from '@lightdash/common';
import { preserveDashboardTileUuids } from './dashboardTileIdentity';

const chartTile = (
    uuid: string,
    chartUuid = 'chart',
    overrides: Partial<DashboardChartTile> & { tileSlug?: string } = {},
): DashboardTileWithSlug => ({
    uuid,
    tileSlug: 'chart',
    type: DashboardTileTypes.SAVED_CHART,
    x: 0,
    y: 0,
    w: 6,
    h: 5,
    tabUuid: null,
    properties: { savedChartUuid: chartUuid, chartSlug: 'chart' },
    ...overrides,
});

describe('preserveDashboardTileUuids', () => {
    it('preserves unique chart identities after moves, resizing, and slug or title changes', () => {
        const previous = chartTile('commented-tile');
        const incoming = chartTile('generated', 'chart', {
            x: 12,
            h: 10,
            tabUuid: 'another-tab',
            tileSlug: 'renamed-chart',
            properties: {
                savedChartUuid: 'chart',
                chartSlug: 'renamed-chart',
                title: 'New title',
            },
        });

        expect(preserveDashboardTileUuids([incoming], [previous])).toEqual([
            { ...incoming, uuid: previous.uuid },
        ]);
        expect(incoming.uuid).toBe('generated');
    });

    it('matches duplicate charts by placement, independent of YAML order and ordinal tile slugs', () => {
        const previous = [
            chartTile('first', 'chart', { x: 0 }),
            chartTile('second', 'chart', { x: 6 }),
        ];
        const incoming = [
            chartTile('new-second', 'chart', { x: 6, tileSlug: 'chart-1' }),
            chartTile('new-first', 'chart', { x: 0, tileSlug: 'chart-2' }),
        ];

        expect(
            preserveDashboardTileUuids(incoming, previous).map(
                (tile) => tile.uuid,
            ),
        ).toEqual(['second', 'first']);
    });

    it('distinguishes duplicate tiles with identical layouts on different tabs', () => {
        const previous = ['tab-a', 'tab-b'].map((tabUuid) =>
            chartTile(`old-${tabUuid}`, 'chart', { tabUuid }),
        );
        const incoming = [...previous].reverse().map((tile) => ({
            ...tile,
            uuid: `new-${tile.tabUuid}`,
        }));
        expect(
            preserveDashboardTileUuids(incoming, previous).map(
                (tile) => tile.uuid,
            ),
        ).toEqual(['old-tab-b', 'old-tab-a']);
    });

    it('does not give a newly added duplicate the original tile comments', () => {
        const previous = [chartTile('original')];
        const incoming = [
            chartTile('new-copy', 'chart', { x: 6 }),
            chartTile('new-original'),
        ];
        expect(
            preserveDashboardTileUuids(incoming, previous).map(
                (tile) => tile.uuid,
            ),
        ).toEqual(['new-copy', 'original']);
    });

    it('keeps the surviving duplicate identity after another duplicate is removed', () => {
        const previous = [
            chartTile('first'),
            chartTile('second', 'chart', { x: 6 }),
        ];
        expect(
            preserveDashboardTileUuids(
                [chartTile('new-second', 'chart', { x: 6 })],
                previous,
            )[0].uuid,
        ).toBe('second');
    });

    it('does not infer an identity for moved or otherwise ambiguous duplicates', () => {
        const previous = [chartTile('first'), chartTile('second')];
        const incoming = [
            chartTile('new-first'),
            chartTile('new-second', 'chart', { x: 6 }),
        ];
        expect(preserveDashboardTileUuids(incoming, previous)).toEqual(
            incoming,
        );
    });

    it('does not reuse an existing identity more than once', () => {
        const previous = [chartTile('original')];
        const incoming = [chartTile('new-first'), chartTile('new-second')];
        expect(preserveDashboardTileUuids(incoming, previous)).toEqual(
            incoming,
        );
    });

    it('reserves UUIDs already explicitly used by uploaded tiles', () => {
        const previous = [chartTile('original')];
        const incoming = [
            chartTile('original', 'chart', { x: 6 }),
            chartTile('new-copy'),
        ];
        expect(preserveDashboardTileUuids(incoming, previous)).toEqual(
            incoming,
        );
    });

    it('does not transfer comments to a replacement chart with the same slug and layout', () => {
        const incoming = [chartTile('replacement', 'different-chart')];
        expect(
            preserveDashboardTileUuids(incoming, [chartTile('original')]),
        ).toEqual(incoming);
    });

    it('does not match unresolved chart references', () => {
        const previous = chartTile('original', 'chart', {
            properties: { savedChartUuid: null, chartSlug: 'missing' },
        });
        const incoming = { ...previous, uuid: 'generated' };
        expect(preserveDashboardTileUuids([incoming], [previous])).toEqual([
            incoming,
        ]);
    });

    it('leaves new dashboard UUIDs untouched', () => {
        const incoming = [chartTile('new')];
        expect(preserveDashboardTileUuids(incoming, [])).toEqual(incoming);
    });

    const otherTiles: DashboardTile[] = [
        {
            ...chartTile('sql'),
            type: DashboardTileTypes.SQL_CHART,
            properties: { savedSqlUuid: 'sql-chart', chartName: 'SQL' },
        },
        {
            ...chartTile('app'),
            type: DashboardTileTypes.DATA_APP,
            properties: { appUuid: 'app', title: 'App' },
        },
        {
            ...chartTile('markdown'),
            type: DashboardTileTypes.MARKDOWN,
            properties: { title: 'Notes', content: 'Review this' },
        },
        {
            ...chartTile('loom'),
            type: DashboardTileTypes.LOOM,
            properties: { title: 'Video', url: 'https://example.com/video' },
        },
        {
            ...chartTile('heading'),
            type: DashboardTileTypes.HEADING,
            properties: { text: 'Heading' },
        },
    ];

    it.each(otherTiles)(
        'preserves unchanged $type tiles after a move',
        (previous) => {
            const incoming = {
                ...previous,
                uuid: 'new',
                x: 6,
                tileSlug: undefined,
            };
            expect(preserveDashboardTileUuids([incoming], [previous])).toEqual([
                { ...incoming, uuid: previous.uuid },
            ]);
        },
    );

    it('does not match different tile types even when content UUIDs coincide', () => {
        const incoming = { ...otherTiles[0], uuid: 'new', tileSlug: undefined };
        expect(
            preserveDashboardTileUuids(
                [incoming],
                [chartTile('original', 'sql-chart')],
            ),
        ).toEqual([incoming]);
    });
});
