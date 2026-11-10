import {
    DashboardTileTypes,
    FilterOperator,
    type DashboardChartTile,
    type DashboardFilterRule,
    type DashboardMarkdownTile,
    type DashboardFilters,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getPendingChanges, type DashboardSnapshot } from './getPendingChanges';

const tile = (
    uuid: string,
    overrides: Partial<Omit<DashboardChartTile, 'uuid' | 'type'>> = {},
): DashboardChartTile => ({
    uuid,
    type: DashboardTileTypes.SAVED_CHART,
    x: 0,
    y: 0,
    w: 6,
    h: 3,
    tabUuid: undefined,
    properties: { savedChartUuid: `chart-${uuid}`, title: `Tile ${uuid}` },
    ...overrides,
});

const rule = (id: string, values: string[] = ['a']): DashboardFilterRule => ({
    id,
    label: undefined,
    target: { fieldId: `field_${id}`, tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values,
});

const filters = (dimensions: DashboardFilterRule[]): DashboardFilters => ({
    dimensions,
    metrics: [],
    tableCalculations: [],
});

const snapshot = (
    overrides: Partial<DashboardSnapshot> = {},
): DashboardSnapshot => ({
    tiles: [tile('a'), tile('b', { x: 6 })],
    tabs: [],
    filters: filters([rule('f1')]),
    parameters: {},
    ...overrides,
});

const labels = {
    getFilterLabel: (filterRule: DashboardFilterRule) =>
        `Filter ${filterRule.id}`,
    getParameterLabel: (key: string) => `Param ${key}`,
};

const changesOf = (draft: Partial<DashboardSnapshot>) =>
    getPendingChanges(snapshot(), snapshot(draft), labels).map(
        ({ area, kind, label, detail }) => ({ area, kind, label, detail }),
    );

describe('getPendingChanges', () => {
    it('finds nothing when the draft matches the saved dashboard', () => {
        expect(changesOf({})).toEqual([]);
    });

    describe('tiles', () => {
        it('counts every placement change as one layout change', () => {
            expect(
                changesOf({
                    tiles: [tile('a', { y: 3 }), tile('b', { x: 6, w: 4 })],
                }),
            ).toEqual([
                {
                    area: 'layout',
                    kind: 'moved',
                    label: '2 tiles',
                    detail: null,
                },
            ]);
        });

        it('lists added and removed tiles by name', () => {
            expect(changesOf({ tiles: [tile('a'), tile('c')] })).toEqual([
                { area: 'tile', kind: 'added', label: 'Tile c', detail: null },
                {
                    area: 'tile',
                    kind: 'removed',
                    label: 'Tile b',
                    detail: null,
                },
            ]);
        });

        it('names the tab a tile moved to', () => {
            const tabs = [
                { uuid: 't1', name: 'Overview', order: 0 },
                { uuid: 't2', name: 'Details', order: 1 },
            ];
            expect(
                getPendingChanges(
                    snapshot({ tabs, tiles: [tile('a', { tabUuid: 't1' })] }),
                    snapshot({ tabs, tiles: [tile('a', { tabUuid: 't2' })] }),
                    labels,
                ).map(({ kind, detail }) => ({ kind, detail })),
            ).toEqual([{ kind: 'moved', detail: 'Details' }]);
        });

        it('marks a renamed tile as edited', () => {
            expect(
                changesOf({
                    tiles: [
                        tile('a', {
                            properties: {
                                savedChartUuid: 'chart-a',
                                title: 'Renamed',
                            },
                        }),
                        tile('b', { x: 6 }),
                    ],
                }),
            ).toEqual([
                {
                    area: 'tile',
                    kind: 'edited',
                    label: 'Renamed',
                    detail: null,
                },
            ]);
        });

        it('falls back to the chart name, then the tile type, for a label', () => {
            const untitled = tile('c', {
                properties: {
                    savedChartUuid: 'chart-c',
                    chartName: 'Revenue',
                },
            });
            const heading: DashboardMarkdownTile = {
                uuid: 'd',
                type: DashboardTileTypes.MARKDOWN,
                x: 0,
                y: 9,
                w: 6,
                h: 3,
                tabUuid: undefined,
                properties: { title: '', content: '' },
            };
            expect(
                changesOf({
                    tiles: [...snapshot().tiles, untitled, heading],
                }).map(({ label }) => label),
            ).toEqual(['Revenue', 'Markdown']);
        });
    });

    describe('tabs', () => {
        const tabs = [
            { uuid: 't1', name: 'Overview', order: 0 },
            { uuid: 't2', name: 'Details', order: 1 },
        ];

        it('lists a rename with the old name', () => {
            expect(
                getPendingChanges(
                    snapshot({ tabs }),
                    snapshot({
                        tabs: [{ ...tabs[0], name: 'Summary' }, tabs[1]],
                    }),
                    labels,
                ).map(({ kind, label, detail }) => ({ kind, label, detail })),
            ).toEqual([
                { kind: 'renamed', label: 'Summary', detail: 'Overview' },
            ]);
        });

        it('reports a reorder once', () => {
            expect(
                getPendingChanges(
                    snapshot({ tabs }),
                    snapshot({
                        tabs: [
                            { ...tabs[0], order: 1 },
                            { ...tabs[1], order: 0 },
                        ],
                    }),
                    labels,
                ).map(({ kind }) => kind),
            ).toEqual(['reordered']);
        });

        it('does not report a reorder for an added tab', () => {
            expect(
                getPendingChanges(
                    snapshot({ tabs }),
                    snapshot({
                        tabs: [...tabs, { uuid: 't3', name: 'New', order: 2 }],
                    }),
                    labels,
                ).map(({ kind }) => kind),
            ).toEqual(['added']);
        });
    });

    describe('filters', () => {
        it('lists added, removed and edited filters', () => {
            const saved = snapshot({
                filters: filters([rule('f1'), rule('f2')]),
            });
            const draft = snapshot({
                filters: filters([rule('f1', ['b']), rule('f3')]),
            });
            expect(
                getPendingChanges(saved, draft, labels).map(
                    ({ kind, label }) => `${kind} ${label}`,
                ),
            ).toEqual([
                'added Filter f3',
                'removed Filter f2',
                'edited Filter f1',
            ]);
        });

        it('counts a change of the tiles a filter applies to', () => {
            const retargeted = {
                ...rule('f1'),
                tileTargets: { a: false as const },
            };
            expect(
                changesOf({ filters: filters([retargeted]) }).map(
                    ({ kind }) => kind,
                ),
            ).toEqual(['edited']);
        });

        it('ignores a date value that only changed serialization', () => {
            const date = new Date('2026-01-01T00:00:00.000Z');
            expect(
                getPendingChanges(
                    snapshot({
                        filters: filters([
                            { ...rule('f1'), values: [date.toISOString()] },
                        ]),
                    }),
                    snapshot({
                        filters: filters([{ ...rule('f1'), values: [date] }]),
                    }),
                    labels,
                ),
            ).toEqual([]);
        });
    });

    describe('parameters', () => {
        const value = (v: string) => ({ parameterName: 'region', value: v });

        it('lists a changed default value', () => {
            expect(
                getPendingChanges(
                    snapshot({ parameters: { region: value('EU') } }),
                    snapshot({ parameters: { region: value('US') } }),
                    labels,
                ).map(({ kind, label }) => `${kind} ${label}`),
            ).toEqual(['edited Param region']);
        });

        it('lists added and removed parameters', () => {
            expect(
                getPendingChanges(
                    snapshot({ parameters: { region: value('EU') } }),
                    snapshot({ parameters: { market: value('B2B') } }),
                    labels,
                ).map(({ kind, label }) => `${kind} ${label}`),
            ).toEqual(['removed Param region', 'added Param market']);
        });
    });
});
