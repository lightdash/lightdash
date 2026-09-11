import {
    DashboardTileTypes,
    type Comment,
    type DashboardTile,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    countThreads,
    getTileTitle,
    groupCommentsByTile,
    REMOVED_TILE_TITLE,
    REMOVED_TILES_SECTION_LABEL,
    sectionGroupsByTab,
} from './groupCommentsByTile';

const comment = (commentId: string): Comment => ({
    commentId,
    text: commentId,
    textHtml: `<p>${commentId}</p>`,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    user: {
        name: 'Ada Lovelace',
        userUuid: 'user-1',
        avatarUrl: null,
        avatarGradient: null,
    },
    replyTo: undefined,
    replies: [],
    resolved: false,
    canRemove: false,
    mentions: [],
});

const chartTile = (
    uuid: string,
    position: { x: number; y: number; tabUuid?: string },
    title?: string,
): DashboardTile => ({
    uuid,
    x: position.x,
    y: position.y,
    w: 6,
    h: 3,
    tabUuid: position.tabUuid,
    type: DashboardTileTypes.SAVED_CHART,
    properties: {
        title,
        savedChartUuid: `chart-${uuid}`,
        chartName: `Chart ${uuid}`,
    },
});

describe('groupCommentsByTile', () => {
    it('orders groups by tab, then row, then column', () => {
        const tiles = [
            chartTile('b', { x: 6, y: 0, tabUuid: 'tab-1' }),
            chartTile('d', { x: 0, y: 0, tabUuid: 'tab-2' }),
            chartTile('a', { x: 0, y: 0, tabUuid: 'tab-1' }),
            chartTile('c', { x: 0, y: 3, tabUuid: 'tab-1' }),
        ];
        const groups = groupCommentsByTile({
            commentsByTile: {
                d: [comment('d1')],
                c: [comment('c1')],
                b: [comment('b1')],
                a: [comment('a1'), comment('a2')],
            },
            tiles,
            tabs: [
                { uuid: 'tab-2', name: 'Second', order: 1 },
                { uuid: 'tab-1', name: 'First', order: 0 },
            ],
        });

        expect(groups.map((group) => group.tileUuid)).toEqual([
            'a',
            'b',
            'c',
            'd',
        ]);
        expect(groups[0].tabUuid).toBe('tab-1');
        expect(countThreads(groups)).toBe(5);
    });

    it('skips tiles without comments', () => {
        const groups = groupCommentsByTile({
            commentsByTile: { a: [comment('a1')], b: [] },
            tiles: [
                chartTile('a', { x: 0, y: 0 }),
                chartTile('b', { x: 0, y: 3 }),
            ],
            tabs: [],
        });

        expect(groups.map((group) => group.tileUuid)).toEqual(['a']);
    });

    it('keeps threads on tiles that are no longer on the dashboard, after the rest', () => {
        const groups = groupCommentsByTile({
            commentsByTile: {
                removed: [comment('r1')],
                a: [comment('a1')],
            },
            tiles: [chartTile('a', { x: 0, y: 0 })],
            tabs: [],
        });

        expect(groups.map((group) => group.tileUuid)).toEqual(['a', 'removed']);
        expect(groups[1]).toMatchObject({
            title: REMOVED_TILE_TITLE,
            tileType: null,
            tabUuid: null,
        });
    });
});

describe('getTileTitle', () => {
    it('prefers the tile title over the chart name', () => {
        expect(getTileTitle(chartTile('a', { x: 0, y: 0 }, 'Revenue'))).toBe(
            'Revenue',
        );
        expect(getTileTitle(chartTile('a', { x: 0, y: 0 }))).toBe('Chart a');
    });

    it('falls back to a type label for tiles without a title', () => {
        expect(
            getTileTitle({
                uuid: 'm',
                x: 0,
                y: 0,
                w: 6,
                h: 3,
                tabUuid: undefined,
                type: DashboardTileTypes.MARKDOWN,
                properties: { title: '', content: 'hello' },
            }),
        ).toBe('Markdown');
    });
});

describe('sectionGroupsByTab', () => {
    const tabs = [
        { uuid: 'tab-1', name: 'Revenue', order: 0 },
        { uuid: 'tab-2', name: 'Orders', order: 1 },
    ];

    it('opens a section per tab in the order the groups arrive', () => {
        const groups = groupCommentsByTile({
            commentsByTile: {
                a: [comment('a1')],
                b: [comment('b1')],
                c: [comment('c1')],
            },
            tiles: [
                chartTile('a', { x: 0, y: 0, tabUuid: 'tab-1' }),
                chartTile('b', { x: 0, y: 3, tabUuid: 'tab-1' }),
                chartTile('c', { x: 0, y: 0, tabUuid: 'tab-2' }),
            ],
            tabs,
        });

        const sections = sectionGroupsByTab(groups, tabs);

        expect(
            sections.map((section) => [
                section.label,
                section.groups.map((group) => group.tileUuid),
            ]),
        ).toEqual([
            ['Revenue', ['a', 'b']],
            ['Orders', ['c']],
        ]);
    });

    it('puts removed tiles in a trailing section of their own', () => {
        const groups = groupCommentsByTile({
            commentsByTile: { gone: [comment('g1')], a: [comment('a1')] },
            tiles: [chartTile('a', { x: 0, y: 0, tabUuid: 'tab-1' })],
            tabs,
        });

        const sections = sectionGroupsByTab(groups, tabs);

        expect(sections.map((section) => section.label)).toEqual([
            'Revenue',
            REMOVED_TILES_SECTION_LABEL,
        ]);
        expect(sections[1].tabUuid).toBeNull();
    });
});
