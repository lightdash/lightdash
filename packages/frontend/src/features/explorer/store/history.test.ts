import { ChartType, FilterOperator, type ChartConfig } from '@lightdash/common';
import { type UnknownAction } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import { createExplorerStore } from '.';
import { defaultState } from '../../../providers/Explorer/defaultState';
import { ExplorerSection } from '../../../providers/Explorer/types';
import { derived, withChangeOrigin } from '../../../utils/changeOrigin';
import { explorerActions } from './explorerSlice';
import {
    explorerHistoryActions,
    explorerRootReducer,
    selectCanRedo,
    selectCanUndo,
    type ExplorerRootState,
} from './history';

const mulberry32 = (seed: number) => () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const FIELDS = ['a_one', 'a_two', 'a_three', 'a_four', 'a_five'];
const CHART_TYPES = [
    ChartType.CARTESIAN,
    ChartType.TABLE,
    ChartType.PIE,
    ChartType.BIG_NUMBER,
];
const bigNumber = (label: string): ChartConfig => ({
    type: ChartType.BIG_NUMBER,
    config: { label },
});

const init = () => explorerRootReducer(undefined, { type: '@@init' });
const chartOf = (state: ExplorerRootState) =>
    JSON.stringify([
        state.explorer.unsavedChartVersion,
        state.explorer.unsavedColorPaletteUuid,
    ]);

/** A reducer driven the way the store drives it: each `act` is one gesture */
const harness = () => {
    let state = init();
    let gesture = 0;
    const send = (action: UnknownAction, isDerived: boolean) => {
        state = explorerRootReducer(
            state,
            withChangeOrigin(action, { isDerived, gesture }),
        );
    };
    return {
        get state() {
            return state;
        },
        get past() {
            return state.history.past.length;
        },
        get future() {
            return state.history.future.length;
        },
        act: (...actions: UnknownAction[]) => {
            gesture += 1;
            actions.forEach((action) => send(action, false));
        },
        derive: (action: UnknownAction) => send(action, true),
        undo: () => send(explorerHistoryActions.undo(), false),
        redo: () => send(explorerHistoryActions.redo(), false),
    };
};

const randomEdit = (random: () => number): UnknownAction => {
    const pick = <T>(items: T[]): T =>
        items[Math.floor(random() * items.length)];
    const edits: (() => UnknownAction)[] = [
        () => explorerActions.toggleDimension(pick(FIELDS)),
        () => explorerActions.toggleMetric(pick(FIELDS)),
        () => explorerActions.removeField(pick(FIELDS)),
        () =>
            explorerActions.setSortFields([
                { fieldId: pick(FIELDS), descending: random() < 0.5 },
            ]),
        () => explorerActions.setRowLimit(pick([10, 50, 500])),
        () => explorerActions.setColumnOrder([pick(FIELDS), pick(FIELDS)]),
        () => explorerActions.setColorPaletteUuid(pick(['p1', 'p2', null])),
        () => explorerActions.setChartType({ chartType: pick(CHART_TYPES) }),
        () =>
            explorerActions.setChartConfig({
                chartConfig: bigNumber(`label ${Math.floor(random() * 4)}`),
            }),
        () => explorerActions.setPivotConfig({ columns: [pick(FIELDS)] }),
        () =>
            explorerActions.setFilters({
                dimensions: {
                    id: 'root',
                    and: [
                        {
                            id: 'rule',
                            target: { fieldId: pick(FIELDS) },
                            operator: FilterOperator.EQUALS,
                            values: [pick([1, 2, 3])],
                        },
                    ],
                },
            }),
        // Leaves the chart alone
        () => explorerActions.toggleExpandedSection(ExplorerSection.RESULTS),
        () => explorerActions.setIsEditMode(random() < 0.5),
    ];
    return pick(edits)();
};

describe('explorer history', () => {
    // The model knows nothing of the reducer: a list of serialized charts, a cursor and the open gesture
    it.each([1, 2, 3, 4, 5, 6, 7, 8])(
        'matches a timeline model over a random walk (seed %i)',
        (seed) => {
            const random = mulberry32(seed);
            let state = init();
            let timeline = [chartOf(state)];
            let cursor = 0;
            let gesture = 0;
            let openGesture: number | null = null;

            for (let i = 0; i < 500; i += 1) {
                const roll = random();
                const before = chartOf(state);
                // A third of the edits share the gesture of the action before them
                if (random() > 0.33) gesture += 1;

                if (roll < 0.2) {
                    state = explorerRootReducer(
                        state,
                        explorerHistoryActions.undo(),
                    );
                    if (cursor > 0) {
                        cursor -= 1;
                        openGesture = null;
                    }
                } else if (roll < 0.3) {
                    state = explorerRootReducer(
                        state,
                        explorerHistoryActions.redo(),
                    );
                    if (cursor < timeline.length - 1) {
                        cursor += 1;
                        openGesture = null;
                    }
                } else {
                    const isDerived = roll < 0.45;
                    state = explorerRootReducer(
                        state,
                        withChangeOrigin(randomEdit(random), {
                            isDerived,
                            gesture,
                        }),
                    );
                    const after = chartOf(state);
                    if (isDerived) {
                        timeline[cursor] = after;
                    } else if (after !== before) {
                        if (openGesture === gesture && cursor > 0) {
                            timeline[cursor] = after;
                            if (after === timeline[cursor - 1]) {
                                timeline = timeline.slice(0, cursor);
                                cursor -= 1;
                                openGesture = null;
                            }
                        } else {
                            timeline = [
                                ...timeline.slice(0, cursor + 1),
                                after,
                            ];
                            cursor += 1;
                            openGesture = gesture;
                            if (timeline.length > 51) {
                                timeline = timeline.slice(1);
                                cursor -= 1;
                            }
                        }
                    }
                }

                expect(chartOf(state)).toBe(timeline[cursor]);
                expect(state.history.past).toHaveLength(cursor);
                expect(state.history.future).toHaveLength(
                    timeline.length - 1 - cursor,
                );
            }
        },
    );

    it('makes one step of everything a gesture changes', () => {
        const h = harness();
        const first = chartOf(h.state);
        h.act(
            explorerActions.setChartType({ chartType: ChartType.PIE }),
            explorerActions.setPivotConfig({ columns: ['a_one'] }),
            explorerActions.toggleDimension('a_one'),
        );
        expect(h.past).toBe(1);
        h.undo();
        expect(chartOf(h.state)).toBe(first);
    });

    it('drops a step that ends where it began', () => {
        const h = harness();
        h.act(explorerActions.toggleDimension('a_one'));
        h.act(
            explorerActions.toggleDimension('a_two'),
            explorerActions.toggleDimension('a_two'),
        );
        expect(h.past).toBe(1);
    });

    it('folds a derived change into the chart without a step and without costing redo', () => {
        const h = harness();
        h.act(explorerActions.toggleDimension('a_one'));
        h.undo();
        h.derive(
            explorerActions.setChartConfig({ chartConfig: bigNumber('seed') }),
        );
        expect([h.past, h.future]).toEqual([0, 1]);
        h.redo();
        expect(
            h.state.explorer.unsavedChartVersion.metricQuery.dimensions,
        ).toEqual(['a_one']);
    });

    it('keeps the last 50 steps and redoes every one of them', () => {
        const h = harness();
        for (let i = 0; i < 60; i += 1)
            h.act(explorerActions.setRowLimit(100 + i));
        expect(h.past).toBe(50);
        for (let i = 0; i < 50; i += 1) h.undo();
        expect(selectCanUndo(h.state)).toBe(false);
        for (let i = 0; i < 50; i += 1) h.redo();
        expect(h.state.explorer.unsavedChartVersion.metricQuery.limit).toBe(
            159,
        );
    });

    it('starts over on a new chart, but not on a table name that is already set', () => {
        const h = harness();
        h.act(explorerActions.setTableName('orders'));
        h.act(explorerActions.toggleDimension('a_one'));
        h.act(explorerActions.setTableName('orders'));
        expect(h.past).toBe(1);
        h.act(explorerActions.setTableName('customers'));
        expect(h.past).toBe(0);
        h.act(explorerActions.toggleDimension('a_one'));
        h.act(explorerActions.reset(defaultState));
        expect(h.past).toBe(0);
    });

    it('refuses to travel under an open draft and hands back the same state', () => {
        const h = harness();
        h.act(explorerActions.toggleDimension('a_one'));
        h.act(explorerActions.toggleFormatModal());
        expect(selectCanUndo(h.state)).toBe(false);
        const blocked = h.state;
        h.undo();
        expect(h.state).toBe(blocked);
        expect(explorerRootReducer(blocked, { type: 'unknown' })).toBe(blocked);
        h.act(explorerActions.toggleFormatModal());
        expect(selectCanUndo(h.state)).toBe(true);
    });

    it('brings back the chart type cache the restored chart had', () => {
        const h = harness();
        h.act(explorerActions.setChartType({ chartType: ChartType.PIE }));
        const pie = h.state.explorer.unsavedChartVersion.chartConfig;
        h.act(
            explorerActions.setChartConfig({
                chartConfig: {
                    type: ChartType.PIE,
                    config: { isDonut: true },
                },
            }),
        );
        h.act(
            explorerActions.setChartType({ chartType: ChartType.BIG_NUMBER }),
        );
        h.undo();
        h.undo();
        h.undo();
        h.act(explorerActions.setChartType({ chartType: ChartType.PIE }));
        expect(h.state.explorer.unsavedChartVersion.chartConfig).toEqual(pie);
    });

    it('keeps a rename the chart still has to follow, and runs a query whose table calculations changed', () => {
        const h = harness();
        const calc = { name: 'tc_old', displayName: 'tc', sql: '1' };
        h.act(explorerActions.addTableCalculation(calc));
        h.act(
            explorerActions.updateTableCalculation({
                oldName: 'tc_old',
                tableCalculation: { ...calc, name: 'tc_new' },
            }),
        );
        h.act(explorerActions.setColorPaletteUuid('p1'));
        h.act(explorerActions.clearPendingFetch());

        h.undo();
        expect(h.state.explorer.metadata?.tableCalculations).toEqual([
            { name: 'tc_new', oldName: 'tc_old' },
        ]);
        expect(h.state.explorer.queryExecution.pendingFetch).toBe(false);

        h.undo();
        expect(h.state.explorer.metadata?.tableCalculations ?? []).toEqual([]);
        expect(h.state.explorer.queryExecution.pendingFetch).toBe(true);
    });

    it('makes one step of a chart type authoring session, and none of a cancelled one', () => {
        const h = harness();
        h.act(explorerActions.toggleDimension('a_one'));
        const before = chartOf(h.state);

        h.act(
            explorerActions.startChartTypeAuthoring({ dataAppVizUuid: null }),
        );
        h.act(explorerActions.setPivotConfig({ columns: ['a_one'] }));
        expect(selectCanUndo(h.state)).toBe(false);
        h.act(explorerActions.cancelChartTypeAuthoring());
        expect(chartOf(h.state)).toBe(before);
        expect(h.past).toBe(1);

        h.act(
            explorerActions.startChartTypeAuthoring({ dataAppVizUuid: null }),
        );
        h.act(explorerActions.setPivotConfig({ columns: ['a_one'] }));
        h.act(explorerActions.setRowLimit(7));
        h.act(explorerActions.finishChartTypeAuthoring());
        expect(h.past).toBe(2);
        h.undo();
        expect(chartOf(h.state)).toBe(before);
    });

    it('records nothing and forgets its steps while suspended', () => {
        const h = harness();
        h.act(explorerActions.toggleDimension('a_one'));
        h.act(explorerHistoryActions.setSuspended(true));
        h.act(explorerActions.toggleDimension('a_two'));
        expect([h.past, selectCanUndo(h.state)]).toEqual([0, false]);
        h.act(explorerHistoryActions.setSuspended(false));
        h.act(explorerActions.toggleDimension('a_three'));
        expect(h.past).toBe(1);
    });
});

describe('explorer store', () => {
    const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

    it('reads gestures from browser tasks and derived changes from their scope', async () => {
        const store = createExplorerStore();
        store.dispatch(explorerActions.toggleDimension('a_one'));
        store.dispatch(explorerActions.toggleDimension('a_two'));
        expect(store.getState().history.past).toHaveLength(1);

        await nextTask();
        store.dispatch(explorerActions.toggleDimension('a_three'));
        expect(store.getState().history.past).toHaveLength(2);

        await nextTask();
        store.dispatch(explorerHistoryActions.undo());
        derived(() => store.dispatch(explorerActions.setRowLimit(7)));
        expect(store.getState().history.past).toHaveLength(1);
        expect(selectCanRedo(store.getState())).toBe(true);
    });
});
