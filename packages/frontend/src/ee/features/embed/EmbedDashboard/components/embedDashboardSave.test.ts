import {
    DashboardControlRefKind,
    FilterInteractivityValues,
    FilterOperator,
    type Dashboard,
    type DashboardFilterRule,
    type DashboardParameterControl,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    dashboardEditActions,
    dashboardParametersActions,
} from '../../../../../features/dashboard/store';
import { createDashboardTestStore } from '../../../../../testing/dashboardStore';
import {
    buildEmbedDashboardUpdate,
    getEmbedControlDrafts,
    haveEmbedControlsChanged,
    type EmbedControlDrafts,
} from './embedDashboardSave';

const rule = (id: string, extra: Partial<DashboardFilterRule> = {}) =>
    ({
        id,
        label: undefined,
        operator: FilterOperator.EQUALS,
        target: { fieldId: `orders_${id}`, tableName: 'orders' },
        values: ['x'],
        ...extra,
    }) as DashboardFilterRule;

const regionControl = (value: string | null): DashboardParameterControl => ({
    id: 'region-control',
    label: 'Region',
    value,
    valueType: { type: 'string', multiple: false },
    parameters: { region: 'all' },
});

const savedZoom = {
    controls: [{ uuid: 'z1', name: 'Revenue zoom', granularity: 'Week' }],
    tileTargets: {
        t1: { controlUuid: 'z1', fieldId: 'orders_date', tableName: 'orders' },
    },
};

const dashboard = {
    filters: {
        dimensions: [rule('status', { label: 'Status' })],
        metrics: [],
        tableCalculations: [],
    },
    config: {
        isDateZoomDisabled: true,
        isAddFilterDisabled: false,
        pinnedParameters: ['region'],
        parameterOrder: ['region'],
        dateZoomGranularities: ['Day', 'Week'],
        defaultDateZoomGranularity: 'Week',
        dateZoomConfig: savedZoom,
        requiredFiltersNote: 'Pick a status',
        controlSections: [{ id: 'a', name: 'Dates' }],
        parameterControls: [regionControl('emea')],
    },
    parameters: { region: { parameterName: 'region', value: 'emea' } },
} as unknown as Pick<Dashboard, 'filters' | 'config' | 'parameters'>;

const storeFilters = {
    dimensions: [
        rule('status', { label: 'Estado', required: true }),
        rule('city'),
    ],
    metrics: [],
    tableCalculations: [],
};

const base = {
    dashboard,
    name: 'Sales',
    tiles: [],
    tabs: [],
    filters: storeFilters,
    filterLabelOverrides: { labels: { Status: 'Estado' } },
    isAddFilterDisabled: true,
    isDateZoomDisabled: null,
    filtersInteractivity: { enabled: FilterInteractivityValues.all },
} as unknown as Omit<
    Parameters<typeof buildEmbedDashboardUpdate>[0],
    'controlDrafts'
>;

// The store as an embed has it: nothing staged, the saved controls seeded
const unchangedDrafts: EmbedControlDrafts = {
    controlOrder: undefined,
    hasControlOrderChanged: false,
    controlSections: [{ id: 'a', name: 'Dates' }],
    haveControlSectionsChanged: false,
    parameterControls: [regionControl('emea')],
    areParameterControlsSaved: true,
    haveParameterControlsChanged: false,
    parameterPicks: {},
    dateZoomConfig: savedZoom,
    hasDateZoomConfigChanged: false,
    dateZoomGranularities: ['Day', 'Week'],
    haveDateZoomGranularitiesChanged: false,
    defaultDateZoomGranularity: 'Week',
    hasDefaultDateZoomGranularityChanged: false,
    requiredFiltersNote: 'Pick a status',
    areParametersAllowed: true,
    areFiltersShown: true,
};
const ALL_KINDS = { dateZoom: true, parameters: true, filters: true };

describe('buildEmbedDashboardUpdate', () => {
    it('sends the save as it was before the controls, with them off', () => {
        expect(
            buildEmbedDashboardUpdate({ ...base, controlDrafts: null }),
        ).toEqual({
            tiles: [],
            filters: {
                // Raw rules, the translated label put back
                dimensions: [
                    rule('status', { label: 'Status', required: true }),
                    rule('city'),
                ],
                metrics: [],
                tableCalculations: [],
            },
            name: 'Sales',
            tabs: [],
            config: {
                ...dashboard.config,
                isDateZoomDisabled: true,
                isAddFilterDisabled: true,
            },
            parameters: dashboard.parameters,
        });
    });

    it('carries the loaded config through an unrelated save with the controls on', () => {
        const update = buildEmbedDashboardUpdate({
            ...base,
            controlDrafts: unchangedDrafts,
        });
        // The whole payload: nothing beyond the loaded config is written,
        // and no order until the editor reorders
        expect(update).toEqual({
            tiles: [],
            filters: {
                dimensions: [
                    rule('status', { label: 'Status', required: true }),
                    rule('city'),
                ],
                metrics: [],
                tableCalculations: [],
            },
            name: 'Sales',
            tabs: [],
            config: {
                ...dashboard.config,
                isAddFilterDisabled: true,
            },
            parameters: dashboard.parameters,
        });
    });

    it('keeps the keys the embed store never holds as loaded', () => {
        const update = buildEmbedDashboardUpdate({
            ...base,
            controlDrafts: {
                ...unchangedDrafts,
                haveControlSectionsChanged: true,
                controlSections: [],
            },
        });
        expect(update).toMatchObject({
            config: {
                isDateZoomDisabled: true,
                pinnedParameters: ['region'],
                parameterOrder: ['region'],
                controlSections: [],
            },
        });
    });

    it("sends the editor's date zoom visibility where the store holds it", () => {
        const untouched = buildEmbedDashboardUpdate({
            ...base,
            isDateZoomDisabled: true,
            controlDrafts: unchangedDrafts,
        });
        expect(untouched).toMatchObject({
            config: { isDateZoomDisabled: true },
        });
        const toggled = buildEmbedDashboardUpdate({
            ...base,
            isDateZoomDisabled: false,
            controlDrafts: unchangedDrafts,
        });
        expect(toggled).toMatchObject({
            config: { isDateZoomDisabled: false, pinnedParameters: ['region'] },
        });
    });

    it('keeps an absent pinned list absent', () => {
        const update = buildEmbedDashboardUpdate({
            ...base,
            dashboard: {
                ...dashboard,
                config: { isDateZoomDisabled: false },
            },
            controlDrafts: { ...unchangedDrafts, parameterControls: null },
        });
        expect(
            'config' in update ? update.config?.pinnedParameters : null,
        ).toBeUndefined();
    });

    it('writes the changed controls, and the parameters as their mirror', () => {
        const zoom = {
            controls: [
                ...savedZoom.controls,
                { uuid: 'z2', name: 'Orders zoom', granularity: 'Month' },
            ],
            tileTargets: {
                ...savedZoom.tileTargets,
                t2: {
                    controlUuid: 'z2',
                    fieldId: 'orders_date',
                    tableName: 'orders',
                },
            },
        };
        const order = [
            { kind: DashboardControlRefKind.FILTER, id: 'city' },
            { kind: DashboardControlRefKind.FILTER, id: 'status' },
        ];
        const update = buildEmbedDashboardUpdate({
            ...base,
            controlDrafts: {
                ...unchangedDrafts,
                controlOrder: order,
                hasControlOrderChanged: true,
                controlSections: [{ id: 'b', name: 'People' }],
                haveControlSectionsChanged: true,
                parameterControls: [regionControl('apac')],
                haveParameterControlsChanged: true,
                dateZoomConfig: zoom,
                hasDateZoomConfigChanged: true,
                dateZoomGranularities: ['Month'],
                haveDateZoomGranularitiesChanged: true,
                defaultDateZoomGranularity: 'Month',
                hasDefaultDateZoomGranularityChanged: true,
                requiredFiltersNote: 'Pick a city',
            } as EmbedControlDrafts,
        });
        expect(update).toMatchObject({
            config: {
                parameterControls: [regionControl('apac')],
                dateZoomConfig: zoom,
                dateZoomGranularities: ['Month'],
                defaultDateZoomGranularity: 'Month',
                requiredFiltersNote: 'Pick a city',
                controlSections: [{ id: 'b', name: 'People' }],
            },
            parameters: { region: { parameterName: 'region', value: 'apac' } },
        });
        if (!('config' in update) || !('filters' in update)) {
            throw new Error('Expected a versioned update');
        }
        const savedOrder = update.config?.controlOrder ?? [];
        expect(savedOrder.slice(0, 2)).toMatchObject(order);
        // Every control is in the order, and the rules follow it
        expect(savedOrder.map(({ id }) => id)).toEqual(
            expect.arrayContaining(['region-control', 'z1', 'z2', 'b']),
        );
        expect(update.filters?.dimensions.map(({ id }) => id)).toEqual([
            'city',
            'status',
        ]);
        // A required filter keeps its value as its default, its label restored
        expect(update.filters?.dimensions[1]).toMatchObject({
            label: 'Status',
            values: ['x'],
        });
    });
});

describe('filters the embed token hides', () => {
    const loadedFilters = {
        dimensions: [
            rule('a', { sectionId: 'a' }),
            rule('b'),
            rule('c', { label: 'Status' }),
        ],
        metrics: [rule('m')],
        tableCalculations: [rule('t')],
    };
    const loaded = { ...dashboard, filters: loadedFilters } as typeof dashboard;
    const editedB = rule('b', { values: ['edited'] });
    const some = {
        enabled: FilterInteractivityValues.some,
        allowedFilters: ['b'],
    };
    // What `some` leaves in the store: the allowed rule, every metric and calc
    const storeWith = (dimensions: DashboardFilterRule[]) => ({
        dimensions,
        metrics: loadedFilters.metrics,
        tableCalculations: loadedFilters.tableCalculations,
    });
    const emptyStore = { dimensions: [], metrics: [], tableCalculations: [] };

    describe.each([
        ['with the controls off', null],
        ['with the controls on', unchangedDrafts],
    ])('%s', (_name, drafts) => {
        const save = (
            args: Pick<
                Parameters<typeof buildEmbedDashboardUpdate>[0],
                'filters' | 'filtersInteractivity'
            >,
        ) => {
            const update = buildEmbedDashboardUpdate({
                ...base,
                dashboard: loaded,
                ...args,
                // The bar shows no filter area unless the token allows some
                controlDrafts: drafts && {
                    ...drafts,
                    areFiltersShown: args.filters !== emptyStore,
                },
            });
            if (!('filters' in update)) {
                throw new Error('Expected a versioned update');
            }
            return update.filters;
        };

        it.each([
            ['none', { enabled: FilterInteractivityValues.none }],
            ['a false flag', { enabled: false }],
            ['no interactivity', null],
        ])('saves the filters as loaded under %s', (_case, interactivity) => {
            expect(
                save({
                    filters: emptyStore,
                    filtersInteractivity: interactivity,
                }),
            ).toEqual(loadedFilters);
        });

        it("keeps the rules 'some' hides in place around the editor's edit", () => {
            expect(
                save({
                    filters: storeWith([editedB]),
                    filtersInteractivity: some,
                }),
            ).toEqual(
                storeWith([
                    rule('a', { sectionId: 'a' }),
                    editedB,
                    rule('c', { label: 'Status' }),
                ]),
            );
        });

        it("keeps the rules 'some' hides when the editor removes the allowed one", () => {
            expect(
                save({ filters: storeWith([]), filtersInteractivity: some })
                    ?.dimensions,
            ).toEqual([
                loadedFilters.dimensions[0],
                loadedFilters.dimensions[2],
            ]);
        });

        it("keeps the rules 'some' hides when the editor adds one", () => {
            expect(
                save({
                    filters: storeWith([editedB, rule('new')]),
                    filtersInteractivity: some,
                })?.dimensions.map(({ id }) => id),
            ).toEqual(['a', 'b', 'c', 'new']);
        });

        it.each([
            ['no allowed filters', { allowedFilters: [] }],
            ['a null allowed list', { allowedFilters: null }],
        ])(
            "keeps every dimension rule under 'some' with %s",
            (_case, allowed) => {
                expect(
                    save({
                        filters: storeWith([]),
                        filtersInteractivity: {
                            enabled: FilterInteractivityValues.some,
                            ...allowed,
                        },
                    })?.dimensions,
                ).toEqual(loadedFilters.dimensions);
            },
        );

        it("keeps the rules 'some' hides when the token also hides the bar", () => {
            expect(
                save({
                    filters: storeWith([editedB]),
                    filtersInteractivity: { ...some, hidden: true },
                })?.dimensions.map(({ id }) => id),
            ).toEqual(['a', 'b', 'c']);
        });

        it('saves a hidden rule once, as loaded, when the store still holds it', () => {
            expect(
                save({
                    filters: storeWith([
                        rule('a', { values: ['edited'] }),
                        editedB,
                    ]),
                    filtersInteractivity: some,
                })?.dimensions,
            ).toEqual([
                loadedFilters.dimensions[0],
                editedB,
                loadedFilters.dimensions[2],
            ]);
        });

        it("saves the editor's metric and calculation rules under 'some'", () => {
            expect(
                save({
                    filters: {
                        dimensions: [editedB],
                        metrics: [],
                        tableCalculations: [rule('t2')],
                    },
                    filtersInteractivity: some,
                }),
            ).toMatchObject({ metrics: [], tableCalculations: [rule('t2')] });
        });

        it.each([
            ['all', { enabled: FilterInteractivityValues.all }],
            ['hidden', { enabled: true, hidden: true }],
        ])("saves the editor's filters under %s", (_case, interactivity) => {
            expect(
                save({
                    filters: storeWith([editedB]),
                    filtersInteractivity: interactivity,
                }),
            ).toEqual(storeWith([editedB]));
        });
    });
});

describe('embed control drafts', () => {
    it('reads no change from a store nothing was staged in', () => {
        const store = createDashboardTestStore();
        const drafts = getEmbedControlDrafts(
            store.getState(),
            dashboard.config,
            ALL_KINDS,
        );
        expect(drafts).toMatchObject({
            dateZoomConfig: savedZoom,
            dateZoomGranularities: ['Day', 'Week'],
            defaultDateZoomGranularity: 'Week',
            requiredFiltersNote: 'Pick a status',
        });
        expect(haveEmbedControlsChanged(dashboard, drafts)).toBe(false);
    });

    it.each([
        [
            'a section change',
            dashboardEditActions.setHaveControlSectionsChanged(true),
        ],
        ['a reorder', dashboardEditActions.setHasControlOrderChanged(true)],
        [
            'a parameter control change',
            dashboardParametersActions.setHaveParameterControlsChanged(true),
        ],
        ['a new note', dashboardEditActions.setRequiredFiltersNote('Other')],
        [
            'a date zoom change',
            dashboardEditActions.setDateZoomConfig({
                value: { controls: [], tileTargets: {} },
                changed: true,
                saved: savedZoom,
            } as Parameters<typeof dashboardEditActions.setDateZoomConfig>[0]),
        ],
    ])('enables Save on %s', (_name, action) => {
        const store = createDashboardTestStore();
        store.dispatch(action);
        expect(
            haveEmbedControlsChanged(
                dashboard,
                getEmbedControlDrafts(
                    store.getState(),
                    dashboard.config,
                    ALL_KINDS,
                ),
            ),
        ).toBe(true);
    });

    describe('a kind the token does not allow', () => {
        const emptiedZoom = dashboardEditActions.setDateZoomConfig({
            value: { controls: [], tileTargets: {} },
            changed: true,
            saved: savedZoom,
        } as Parameters<typeof dashboardEditActions.setDateZoomConfig>[0]);

        it('reads and saves date zoom as loaded, whatever the store holds', () => {
            const store = createDashboardTestStore();
            store.dispatch(emptiedZoom);
            store.dispatch(
                dashboardEditActions.setHaveDateZoomGranularitiesChanged(true),
            );
            store.dispatch(
                dashboardEditActions.setHasDefaultDateZoomGranularityChanged(
                    true,
                ),
            );
            const drafts = getEmbedControlDrafts(
                store.getState(),
                dashboard.config,
                { dateZoom: false, parameters: true, filters: true },
            );
            expect(haveEmbedControlsChanged(dashboard, drafts)).toBe(false);
            expect(
                buildEmbedDashboardUpdate({ ...base, controlDrafts: drafts }),
            ).toMatchObject({
                config: {
                    dateZoomConfig: savedZoom,
                    dateZoomGranularities: ['Day', 'Week'],
                    defaultDateZoomGranularity: 'Week',
                },
            });
        });

        it('reads and saves parameters as loaded, whatever the store holds', () => {
            const store = createDashboardTestStore();
            store.dispatch(
                dashboardParametersActions.syncParameterControls({
                    controls: [regionControl('apac')],
                    isSaved: true,
                }),
            );
            store.dispatch(
                dashboardParametersActions.setHaveParameterControlsChanged(
                    true,
                ),
            );
            const drafts = getEmbedControlDrafts(
                store.getState(),
                dashboard.config,
                { dateZoom: true, parameters: false, filters: true },
            );
            expect(haveEmbedControlsChanged(dashboard, drafts)).toBe(false);
            const update = buildEmbedDashboardUpdate({
                ...base,
                controlDrafts: drafts,
            });
            expect(update).toMatchObject({
                config: { parameterControls: [regionControl('emea')] },
            });
            expect('parameters' in update ? update.parameters : null).toBe(
                dashboard.parameters,
            );
        });

        // A reorder: the second saved control first, then the filters swapped
        const twoControls = [
            regionControl('emea'),
            {
                ...regionControl('x'),
                id: 'other',
                parameters: { other: 'all' },
            },
        ] as DashboardParameterControl[];
        const reordered = [
            { kind: DashboardControlRefKind.PARAMETER, id: 'other' },
            { kind: DashboardControlRefKind.FILTER, id: 'city' },
            { kind: DashboardControlRefKind.PARAMETER, id: 'region-control' },
            { kind: DashboardControlRefKind.FILTER, id: 'status' },
        ];
        const loaded = {
            ...dashboard,
            config: { ...dashboard.config, parameterControls: twoControls },
        } as typeof dashboard;

        it('keeps the loaded parameter controls in their order through a filter reorder', () => {
            const update = buildEmbedDashboardUpdate({
                ...base,
                dashboard: loaded,
                controlDrafts: {
                    ...unchangedDrafts,
                    parameterControls: twoControls,
                    controlOrder: reordered,
                    hasControlOrderChanged: true,
                    areParametersAllowed: false,
                },
            });
            if (!('config' in update) || !('filters' in update)) {
                throw new Error('Expected a versioned update');
            }
            expect(update.config?.parameterControls).toEqual(twoControls);
            expect(update.parameters).toBe(loaded.parameters);
            // The filters do follow the order, whose refs keep both controls
            expect(update.filters?.dimensions.map(({ id }) => id)).toEqual([
                'city',
                'status',
            ]);
            expect(
                update.config?.controlOrder
                    ?.filter(
                        ({ kind }) =>
                            kind === DashboardControlRefKind.PARAMETER,
                    )
                    .map(({ id }) => id),
            ).toEqual(['other', 'region-control']);
        });

        it('keeps hidden filter rules in their loaded order when a parameter moves', () => {
            const update = buildEmbedDashboardUpdate({
                ...base,
                dashboard: loaded,
                controlDrafts: {
                    ...unchangedDrafts,
                    parameterControls: twoControls,
                    controlOrder: reordered,
                    hasControlOrderChanged: true,
                    areFiltersShown: false,
                },
            });
            if (!('config' in update) || !('filters' in update)) {
                throw new Error('Expected a versioned update');
            }
            expect(update.filters?.dimensions.map(({ id }) => id)).toEqual([
                'status',
                'city',
            ]);
            // The parameters, which the token allows, follow the move
            expect(
                update.config?.parameterControls?.map(({ id }) => id),
            ).toEqual(['other', 'region-control']);
        });

        it('still counts and saves the kinds it allows', () => {
            const store = createDashboardTestStore();
            store.dispatch(emptiedZoom);
            expect(
                haveEmbedControlsChanged(
                    dashboard,
                    getEmbedControlDrafts(store.getState(), dashboard.config, {
                        dateZoom: true,
                        parameters: false,
                        filters: true,
                    }),
                ),
            ).toBe(true);
        });
    });
});

describe('the control order around filters the embed token hides', () => {
    const filterRef = (id: string, newLine?: true) => ({
        kind: DashboardControlRefKind.FILTER,
        id,
        ...(newLine && { newLine }),
    });
    const parameterRef = (id: string) => ({
        kind: DashboardControlRefKind.PARAMETER,
        id,
    });
    const sectionRef = { kind: DashboardControlRefKind.SECTION, id: 's' };
    const controls = [
        regionControl('emea'),
        { ...regionControl('x'), id: 'other', parameters: { other: 'all' } },
    ] as DashboardParameterControl[];
    const some = {
        enabled: FilterInteractivityValues.some,
        allowedFilters: ['b'],
    };
    const none = { enabled: FilterInteractivityValues.none };
    const emptyFilters = { dimensions: [], metrics: [], tableCalculations: [] };

    // Loaded rules a, b, c; `some` shows b alone, `none` no rule at all
    const savedOrder = ({
        loadedOrder,
        editorOrder,
        filtersInteractivity = some,
        hiddenSectionId,
        storeDimensions = [rule('b')],
    }: {
        loadedOrder: ReturnType<typeof filterRef>[] | undefined;
        editorOrder: ReturnType<typeof filterRef>[] | null;
        filtersInteractivity?: typeof some | typeof none;
        hiddenSectionId?: string;
        storeDimensions?: DashboardFilterRule[];
    }) => {
        const controlSections =
            hiddenSectionId === undefined
                ? []
                : [{ id: hiddenSectionId, name: 'Dates' }];
        const isShown = filtersInteractivity === some;
        const update = buildEmbedDashboardUpdate({
            ...base,
            dashboard: {
                filters: {
                    ...emptyFilters,
                    dimensions: [
                        rule('a', { sectionId: hiddenSectionId }),
                        rule('b'),
                        rule('c'),
                    ],
                },
                config: {
                    isDateZoomDisabled: true,
                    parameterControls: controls,
                    controlSections,
                    controlOrder: loadedOrder,
                },
                parameters: {},
            },
            filters: isShown
                ? { ...emptyFilters, dimensions: storeDimensions }
                : emptyFilters,
            filtersInteractivity,
            controlDrafts: {
                ...unchangedDrafts,
                controlSections,
                parameterControls: controls,
                controlOrder: editorOrder ?? loadedOrder,
                hasControlOrderChanged: editorOrder !== null,
                areFiltersShown: isShown,
            },
        });
        if (!('config' in update)) {
            throw new Error('Expected a versioned update');
        }
        return update.config?.controlOrder;
    };
    const loadedOrder = [
        filterRef('a'),
        filterRef('b'),
        parameterRef('region-control'),
        filterRef('c'),
    ];

    it("keeps the refs 'some' hides in their loaded slots through a reorder", () => {
        expect(
            savedOrder({
                loadedOrder,
                editorOrder: [parameterRef('region-control'), filterRef('b')],
            }),
        ).toEqual([
            filterRef('a'),
            parameterRef('region-control'),
            filterRef('b'),
            filterRef('c'),
            parameterRef('other'),
        ]);
    });

    it("keeps every filter ref under 'none' when a parameter moves", () => {
        expect(
            savedOrder({
                loadedOrder: [...loadedOrder, parameterRef('other')],
                editorOrder: [
                    parameterRef('other'),
                    parameterRef('region-control'),
                ],
                filtersInteractivity: none,
            }),
        ).toEqual([
            filterRef('a'),
            filterRef('b'),
            parameterRef('other'),
            filterRef('c'),
            parameterRef('region-control'),
        ]);
    });

    it("keeps a hidden ref's line start", () => {
        expect(
            savedOrder({
                loadedOrder: [
                    filterRef('b'),
                    filterRef('a', true),
                    parameterRef('region-control'),
                    parameterRef('other'),
                ],
                editorOrder: [
                    parameterRef('other'),
                    parameterRef('region-control'),
                    filterRef('b'),
                ],
            }),
        ).toEqual([
            parameterRef('other'),
            filterRef('a', true),
            parameterRef('region-control'),
            filterRef('b'),
        ]);
    });

    it('keeps a hidden section member at its loaded slot when its section moves', () => {
        // Membership is the rule's `sectionId`: read back, a is still in s
        expect(
            savedOrder({
                loadedOrder: [
                    filterRef('b'),
                    sectionRef,
                    filterRef('a'),
                    parameterRef('region-control'),
                    parameterRef('other'),
                ],
                editorOrder: [
                    sectionRef,
                    filterRef('b'),
                    parameterRef('region-control'),
                    parameterRef('other'),
                ],
                hiddenSectionId: 's',
            }),
        ).toEqual([
            sectionRef,
            filterRef('b'),
            filterRef('a'),
            parameterRef('region-control'),
            parameterRef('other'),
        ]);
    });

    it('writes a hidden ref once when the store still holds its rule', () => {
        expect(
            savedOrder({
                loadedOrder,
                editorOrder: [
                    parameterRef('region-control'),
                    filterRef('b'),
                    filterRef('a'),
                ],
                storeDimensions: [rule('b'), rule('a')],
            })?.filter(({ id }) => id === 'a'),
        ).toEqual([filterRef('a')]);
    });

    it('carries the loaded order forward when the editor reordered nothing', () => {
        expect(savedOrder({ loadedOrder, editorOrder: null })).toEqual(
            loadedOrder,
        );
    });

    it('writes no order where none was saved and nothing was reordered', () => {
        expect(
            savedOrder({ loadedOrder: undefined, editorOrder: null }),
        ).toBeUndefined();
    });
});
