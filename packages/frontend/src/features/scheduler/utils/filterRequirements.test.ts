import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardTile,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getSchedulerFilterRequirements,
    type SchedulerTabScope,
} from './filterRequirements';

const rule = (
    overrides: Partial<DashboardFilterRule> & Pick<DashboardFilterRule, 'id'>,
): DashboardFilterRule => ({
    target: { fieldId: `field_${overrides.id}`, tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: [],
    disabled: true,
    label: undefined,
    tileTargets: {},
    ...overrides,
});

const dashboardFilters = (
    dimensions: DashboardFilterRule[],
    metrics: DashboardFilterRule[] = [],
): DashboardFilters => ({ dimensions, metrics, tableCalculations: [] });

describe('getSchedulerFilterRequirements', () => {
    const groupMembers = [
        rule({ id: 'a', requiredGroupId: 'g1' }),
        rule({ id: 'b', requiredGroupId: 'g1' }),
    ];

    it('flags every member of a fully valueless group', () => {
        const { unmetRequirements, filtersWithUnmetRequirements } =
            getSchedulerFilterRequirements(dashboardFilters(groupMembers), []);
        expect(unmetRequirements).toEqual([
            { type: 'group', groupId: 'g1', filters: groupMembers },
        ]);
        expect(filtersWithUnmetRequirements.map((f) => f.id)).toEqual([
            'a',
            'b',
        ]);
    });

    it('is satisfied when an override provides a value for any member', () => {
        const override = rule({
            id: 'a',
            values: ['card'],
            disabled: false,
        });
        expect(
            getSchedulerFilterRequirements(dashboardFilters(groupMembers), [
                override,
            ]).filtersWithUnmetRequirements,
        ).toEqual([]);
    });

    it('stays unmet for an enabled override with empty values', () => {
        const override = rule({ id: 'a', values: [], disabled: false });
        expect(
            getSchedulerFilterRequirements(dashboardFilters(groupMembers), [
                override,
            ]).filtersWithUnmetRequirements,
        ).toHaveLength(2);
    });

    it('stays unmet when an override tries to strip the group id', () => {
        const override = rule({
            id: 'a',
            requiredGroupId: undefined,
            values: [],
            disabled: false,
        });
        expect(
            getSchedulerFilterRequirements(dashboardFilters(groupMembers), [
                override,
            ]).filtersWithUnmetRequirements,
        ).toHaveLength(2);
    });

    it('is satisfied by a value-less operator on a member', () => {
        const override = rule({
            id: 'a',
            operator: FilterOperator.NULL,
            values: [],
            disabled: false,
        });
        expect(
            getSchedulerFilterRequirements(dashboardFilters(groupMembers), [
                override,
            ]).filtersWithUnmetRequirements,
        ).toEqual([]);
    });

    it('flags unmet required singles from the saved dashboard even with no overrides', () => {
        const required = rule({ id: 'a', required: true });
        expect(
            getSchedulerFilterRequirements(
                dashboardFilters([required]),
                [],
            ).filtersWithUnmetRequirements.map((f) => f.id),
        ).toEqual(['a']);
    });

    it('does not flag required singles with a saved default value', () => {
        const required = rule({
            id: 'a',
            required: true,
            values: ['x'],
            disabled: false,
        });
        expect(
            getSchedulerFilterRequirements(dashboardFilters([required]), [])
                .filtersWithUnmetRequirements,
        ).toEqual([]);
    });

    it('includes unmet requirements on saved metric filters', () => {
        const metric = rule({ id: 'm', required: true });
        expect(
            getSchedulerFilterRequirements(
                dashboardFilters([], [metric]),
                [],
            ).filtersWithUnmetRequirements.map((f) => f.id),
        ).toEqual(['m']);
    });

    it('returns a rule once when it is both required and a group member', () => {
        const both = rule({
            id: 'a',
            required: true,
            requiredGroupId: 'g1',
        });
        const sibling = rule({ id: 'b', requiredGroupId: 'g1' });
        const { filtersWithUnmetRequirements } = getSchedulerFilterRequirements(
            dashboardFilters([both, sibling]),
            [],
        );
        expect(
            filtersWithUnmetRequirements.filter((f) => f.id === 'a'),
        ).toHaveLength(1);
    });

    it('returns nothing without saved dashboard filters', () => {
        expect(
            getSchedulerFilterRequirements(undefined, [])
                .filtersWithUnmetRequirements,
        ).toEqual([]);
    });
});

describe('getSchedulerFilterRequirements tab scoping', () => {
    const tile = (uuid: string, tabUuid: string | undefined): DashboardTile =>
        ({ uuid, tabUuid }) as DashboardTile;

    const field = (name: string): DashboardFilterableField =>
        ({
            fieldType: FieldType.DIMENSION,
            type: DimensionType.STRING,
            name,
            table: 'orders',
        }) as unknown as DashboardFilterableField;

    const tiles = [tile('tile-1', 'tab-1'), tile('tile-2', 'tab-2')];
    // Both tiles can be filtered on both fields, so only tileTargets scope them
    const filterableFieldsByTileUuid = {
        'tile-1': [field('tab1'), field('tab2')],
        'tile-2': [field('tab1'), field('tab2')],
    };

    const tabScope = (selectedTabs: string[] | null): SchedulerTabScope => ({
        tiles,
        tabUuids: ['tab-1', 'tab-2'],
        selectedTabs,
        filterableFieldsByTileUuid,
    });

    // One required filter per tab, each targeting only its own tab's tile
    const tab1Filter = rule({
        id: 'tab1',
        required: true,
        target: { fieldId: 'orders_tab1', tableName: 'orders' },
        tileTargets: {
            'tile-1': { fieldId: 'orders_tab1', tableName: 'orders' },
            'tile-2': false,
        },
    });
    const tab2Filter = rule({
        id: 'tab2',
        required: true,
        target: { fieldId: 'orders_tab2', tableName: 'orders' },
        tileTargets: {
            'tile-1': false,
            'tile-2': { fieldId: 'orders_tab2', tableName: 'orders' },
        },
    });
    const filters = dashboardFilters([tab1Filter, tab2Filter]);

    it('only flags requirements that apply to the selected tabs', () => {
        expect(
            getSchedulerFilterRequirements(
                filters,
                [],
                tabScope(['tab-2']),
            ).filtersWithUnmetRequirements.map((f) => f.id),
        ).toEqual(['tab2']);
    });

    it('flags every requirement when all tabs are included', () => {
        expect(
            getSchedulerFilterRequirements(
                filters,
                [],
                tabScope(null),
            ).filtersWithUnmetRequirements.map((f) => f.id),
        ).toEqual(['tab1', 'tab2']);
    });

    it('scopes nothing out when every tab is selected explicitly', () => {
        const unmatchedFilter = rule({
            id: 'unmatched',
            required: true,
            tileTargets: {
                'tile-1': false,
                'tile-2': false,
            },
        });

        expect(
            getSchedulerFilterRequirements(
                dashboardFilters([unmatchedFilter]),
                [],
                tabScope(['tab-1', 'tab-2']),
            ).filtersWithUnmetRequirements.map((filter) => filter.id),
        ).toEqual(['unmatched']);
    });

    it('does not treat every rendered tile as every dashboard tab', () => {
        const unmatchedFilter = rule({
            id: 'unmatched',
            required: true,
            tileTargets: {
                'tile-1': false,
                'tile-2': false,
            },
        });

        expect(
            getSchedulerFilterRequirements(
                dashboardFilters([unmatchedFilter]),
                [],
                {
                    ...tabScope(['tab-1', 'tab-2']),
                    tabUuids: ['tab-1', 'tab-2', 'empty-tab'],
                },
            ).filtersWithUnmetRequirements.map((f) => f.id),
        ).toEqual([]);
    });

    it('scopes automatic filters by fields available on selected tiles', () => {
        const automaticFilter = rule({
            id: 'automatic',
            required: true,
            target: { fieldId: 'orders_tab1', tableName: 'orders' },
            tileTargets: undefined,
        });
        const automaticScope: SchedulerTabScope = {
            ...tabScope(['tab-2']),
            filterableFieldsByTileUuid: {
                'tile-1': [field('tab1')],
                'tile-2': [field('tab2')],
            },
        };

        expect(
            getSchedulerFilterRequirements(
                dashboardFilters([automaticFilter]),
                [],
                automaticScope,
            ).filtersWithUnmetRequirements,
        ).toEqual([]);
        expect(
            getSchedulerFilterRequirements(
                dashboardFilters([automaticFilter]),
                [],
                { ...automaticScope, selectedTabs: ['tab-1'] },
            ).filtersWithUnmetRequirements.map((filter) => filter.id),
        ).toEqual(['automatic']);
    });

    it('keeps a Data App filter requirement until the tile is explicitly excluded', () => {
        const dataAppTile = {
            uuid: 'data-app-1',
            type: DashboardTileTypes.DATA_APP,
            x: 0,
            y: 0,
            h: 1,
            w: 1,
            tabUuid: 'tab-2',
            properties: {
                appUuid: 'app-1',
                title: 'Data App 1',
            },
        } satisfies DashboardTile;
        const scope: SchedulerTabScope = {
            tiles: [tile('tile-1', 'tab-1'), dataAppTile],
            tabUuids: ['tab-1', 'tab-2'],
            selectedTabs: ['tab-2'],
            filterableFieldsByTileUuid: {
                'tile-1': [field('automatic')],
                'data-app-1': [],
            },
        };
        const automaticFilter = rule({
            id: 'automatic',
            required: true,
            tileTargets: undefined,
        });

        expect(
            getSchedulerFilterRequirements(
                dashboardFilters([automaticFilter]),
                [],
                scope,
            ).filtersWithUnmetRequirements.map((filter) => filter.id),
        ).toEqual(['automatic']);

        expect(
            getSchedulerFilterRequirements(
                dashboardFilters([
                    {
                        ...automaticFilter,
                        tileTargets: { 'data-app-1': false },
                    },
                ]),
                [],
                scope,
            ).filtersWithUnmetRequirements,
        ).toEqual([]);
    });

    it('scopes nothing out while the tiles filterable fields are unknown', () => {
        expect(
            getSchedulerFilterRequirements(filters, [], {
                tiles,
                tabUuids: ['tab-1', 'tab-2'],
                selectedTabs: ['tab-2'],
                filterableFieldsByTileUuid: undefined,
            }).filtersWithUnmetRequirements.map((f) => f.id),
        ).toEqual(['tab1', 'tab2']);
    });

    it('drops a requirement group with no member on the selected tabs', () => {
        const groupOnTab1 = [
            rule({
                id: 'a',
                requiredGroupId: 'g1',
                tileTargets: {
                    'tile-1': { fieldId: 'orders_tab1', tableName: 'orders' },
                },
            }),
            rule({
                id: 'b',
                requiredGroupId: 'g1',
                tileTargets: {
                    'tile-1': { fieldId: 'orders_tab2', tableName: 'orders' },
                },
            }),
        ];
        expect(
            getSchedulerFilterRequirements(
                dashboardFilters(groupOnTab1),
                [],
                tabScope(['tab-2']),
            ).unmetRequirements,
        ).toEqual([]);
    });

    it('does not satisfy a selected-tab group with a value from an omitted tab', () => {
        const populatedTab1Member = rule({
            id: 'a',
            requiredGroupId: 'g1',
            values: ['value'],
            disabled: false,
            tileTargets: {
                'tile-1': { fieldId: 'orders_tab1', tableName: 'orders' },
                'tile-2': false,
            },
        });
        const emptyTab2Member = rule({
            id: 'b',
            requiredGroupId: 'g1',
            tileTargets: {
                'tile-1': false,
                'tile-2': { fieldId: 'orders_tab2', tableName: 'orders' },
            },
        });

        expect(
            getSchedulerFilterRequirements(
                dashboardFilters([populatedTab1Member, emptyTab2Member]),
                [],
                tabScope(['tab-2']),
            ).filtersWithUnmetRequirements.map((filter) => filter.id),
        ).toEqual(['b']);
    });
});
