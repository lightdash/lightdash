import { buildRetentionQueryRequest } from '../utils/retentionConfig';
import { type startAppListening } from './listenerMiddleware';
import {
    clearResults,
    setEventNameFieldId,
    setExploreName,
} from './retentionBuilderSlice';
import { fetchRetentionEventNames, runRetentionQuery } from './thunks';

/** Auto-run the query whenever the configuration is valid and changed. */
export const addRetentionConfigChangeListener = (
    startListening: typeof startAppListening,
) => {
    startListening({
        predicate: (_, currentState, previousState) => {
            const prev = previousState.retentionBuilder;
            const curr = currentState.retentionBuilder;
            return (
                prev.projectUuid !== curr.projectUuid ||
                prev.bornEvent !== curr.bornEvent ||
                prev.returnEvent !== curr.returnEvent ||
                prev.cohortType !== curr.cohortType ||
                prev.unit !== curr.unit ||
                prev.periods !== curr.periods ||
                prev.criteria !== curr.criteria ||
                prev.mode !== curr.mode ||
                prev.dateRangePreset !== curr.dateRangePreset ||
                prev.customDateRange !== curr.customDateRange ||
                prev.filters !== curr.filters ||
                prev.breakdownDimensionId !== curr.breakdownDimensionId
            );
        },
        effect: async (_, listenerApi) => {
            const state = listenerApi.getState();
            if (buildRetentionQueryRequest(state.retentionBuilder)) {
                await listenerApi.dispatch(runRetentionQuery());
            }
        },
    });
};

/** Invalidate results when the explore changes. */
export const addRetentionExploreChangeListener = (
    startListening: typeof startAppListening,
) => {
    startListening({
        actionCreator: setExploreName,
        effect: (_, listenerApi) => {
            listenerApi.dispatch(clearResults());
        },
    });
};

/** Fetch event names when the event field changes. */
export const addRetentionEventFieldChangeListener = (
    startListening: typeof startAppListening,
) => {
    startListening({
        actionCreator: setEventNameFieldId,
        effect: async (action, listenerApi) => {
            const { projectUuid, exploreName, timestampFieldId } =
                listenerApi.getState().retentionBuilder;

            if (
                action.payload &&
                projectUuid &&
                exploreName &&
                timestampFieldId
            ) {
                await listenerApi.dispatch(
                    fetchRetentionEventNames({
                        projectUuid,
                        exploreName,
                        eventDimensionId: action.payload,
                        timestampFieldId,
                    }),
                );
            }
        },
    });
};
