import { createAction, type UnknownAction } from '@reduxjs/toolkit';
import { isEqual } from 'es-toolkit/compat';
import { changeOriginOf } from '../../../utils/changeOrigin';
import {
    explorerActions,
    explorerReducer,
    type ExplorerSliceState,
} from './explorerSlice';

/** Everything an undo step puts back: the chart, and the editing state that only makes sense beside it */
export type ExplorerDocument = Pick<
    ExplorerSliceState,
    | 'unsavedChartVersion'
    | 'unsavedColorPaletteUuid'
    | 'cachedChartConfigs'
    | 'metadata'
>;

export type ExplorerHistoryState = {
    /** The document before each step, oldest first */
    past: ExplorerDocument[];
    /** The documents undone, next redo first */
    future: ExplorerDocument[];
    /** Counts restores, so an editor holding its own copy of the chart can start over */
    revision: number;
    /** Set while later changes still belong to the latest step, with the gesture that began it */
    openStep: { gesture: number | null } | null;
    /** True while state no step can restore is in play */
    isSuspended: boolean;
};

export type ExplorerRootState = {
    explorer: ExplorerSliceState;
    history: ExplorerHistoryState;
};

const EXPLORER_HISTORY_LIMIT = 50;

export const emptyExplorerHistory: ExplorerHistoryState = {
    past: [],
    future: [],
    revision: 0,
    openStep: null,
    isSuspended: false,
};

export const explorerHistoryActions = {
    undo: createAction('explorerHistory/undo'),
    redo: createAction('explorerHistory/redo'),
    setSuspended: createAction<boolean>('explorerHistory/setSuspended'),
};

const toDocument = (state: ExplorerSliceState): ExplorerDocument => ({
    unsavedChartVersion: state.unsavedChartVersion,
    unsavedColorPaletteUuid: state.unsavedColorPaletteUuid,
    cachedChartConfigs: state.cachedChartConfigs,
    metadata: state.metadata,
});

// A step is a change to the chart; the rest of the document only travels with it
const isSameChart = (a: ExplorerDocument, b: ExplorerDocument) =>
    a.unsavedColorPaletteUuid === b.unsavedColorPaletteUuid &&
    (a.unsavedChartVersion === b.unsavedChartVersion ||
        isEqual(a.unsavedChartVersion, b.unsavedChartVersion));

// A draft open over the chart would be left describing another one
const hasOpenDraft = (explorer: ExplorerSliceState) =>
    Object.values(explorer.modals).some((modal) => modal.isOpen) ||
    explorer.queryExecution.pendingCostConfirmation !== null;

// Authoring a chart type is one step however many changes it takes
const isInSession = (explorer: ExplorerSliceState) =>
    explorer.chartTypeAuthoring !== null;

const canTravel = ({ explorer, history }: ExplorerRootState) =>
    !history.isSuspended && !hasOpenDraft(explorer) && !isInSession(explorer);

const startsNewChart = (
    action: UnknownAction,
    before: ExplorerSliceState,
    after: ExplorerSliceState,
) =>
    explorerActions.reset.match(action) ||
    explorerActions.setSavedChart.match(action) ||
    (explorerActions.setTableName.match(action) && !isSameChart(before, after));

const withoutSteps = (history: ExplorerHistoryState): ExplorerHistoryState => ({
    ...emptyExplorerHistory,
    revision: history.revision,
    isSuspended: history.isSuspended,
});

const restore = (
    explorer: ExplorerSliceState,
    document: ExplorerDocument,
): ExplorerSliceState => {
    const haveTableCalculationsChanged = !isEqual(
        explorer.unsavedChartVersion.metricQuery.tableCalculations,
        document.unsavedChartVersion.metricQuery.tableCalculations,
    );
    return {
        ...explorer,
        ...document,
        // Table calculation changes run even with auto-fetch off, here as in their own actions
        queryExecution: haveTableCalculationsChanged
            ? { ...explorer.queryExecution, pendingFetch: true }
            : explorer.queryExecution,
    };
};

const travel = (
    state: ExplorerRootState,
    direction: 'undo' | 'redo',
): ExplorerRootState => {
    const { past, future } = state.history;
    const target = direction === 'undo' ? past.at(-1) : future[0];
    if (!target || !canTravel(state)) return state;
    const current = toDocument(state.explorer);
    return {
        explorer: restore(state.explorer, target),
        history: {
            ...state.history,
            past: direction === 'undo' ? past.slice(0, -1) : [...past, current],
            future:
                direction === 'undo' ? [current, ...future] : future.slice(1),
            revision: state.history.revision + 1,
            openStep: null,
        },
    };
};

const record = (
    history: ExplorerHistoryState,
    action: UnknownAction,
    before: ExplorerSliceState,
    after: ExplorerSliceState,
): ExplorerHistoryState => {
    // A session's changes never join a step from before it
    const openStep =
        isInSession(after) && !isInSession(before) ? null : history.openStep;
    const origin = changeOriginOf(action);
    if (history.isSuspended || origin?.isDerived || isSameChart(before, after))
        return openStep === history.openStep
            ? history
            : { ...history, openStep };

    const base = history.past.at(-1);
    const continuesStep =
        base !== undefined &&
        openStep !== null &&
        (isInSession(before) ||
            (origin !== null && origin.gesture === openStep.gesture));
    if (!continuesStep) {
        return {
            ...history,
            past: [...history.past, toDocument(before)].slice(
                -EXPLORER_HISTORY_LIMIT,
            ),
            future: [],
            openStep: { gesture: origin?.gesture ?? null },
        };
    }
    // A step that ends where it began was never a step
    return isSameChart(base, after)
        ? { ...history, past: history.past.slice(0, -1), openStep: null }
        : history;
};

/**
 * The explorer reducer with undo history. A step is whatever one user gesture changes;
 * changes derived from data fold into the chart without becoming steps or costing the redo stack.
 */
export const explorerRootReducer = (
    state: ExplorerRootState | undefined,
    action: UnknownAction,
): ExplorerRootState => {
    if (!state) {
        return {
            explorer: explorerReducer(undefined, action),
            history: emptyExplorerHistory,
        };
    }
    if (explorerHistoryActions.undo.match(action)) return travel(state, 'undo');
    if (explorerHistoryActions.redo.match(action)) return travel(state, 'redo');
    if (explorerHistoryActions.setSuspended.match(action)) {
        return action.payload === state.history.isSuspended
            ? state
            : {
                  ...state,
                  history: {
                      ...withoutSteps(state.history),
                      isSuspended: action.payload,
                  },
              };
    }

    const explorer = explorerReducer(state.explorer, action);
    if (explorer === state.explorer) return state;
    const history = startsNewChart(action, state.explorer, explorer)
        ? withoutSteps(state.history)
        : record(state.history, action, state.explorer, explorer);
    return { explorer, history };
};

export const selectCanUndo = (state: ExplorerRootState) =>
    state.history.past.length > 0 && canTravel(state);
export const selectCanRedo = (state: ExplorerRootState) =>
    state.history.future.length > 0 && canTravel(state);
export const selectHistoryRevision = (state: ExplorerRootState) =>
    state.history.revision;
