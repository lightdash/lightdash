import { buildEventNamesRequest } from '../../eventAnalytics/utils/eventNames';
import { buildRetentionQueryRequest } from '../utils/retentionConfig';
import { type startAppListening } from './listenerMiddleware';
import { clearResults, setExploreName } from './retentionBuilderSlice';
import { fetchRetentionEventNames, runRetentionQuery } from './thunks';

/** Runs the query whenever the configuration changes and is complete. */
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

/** Clears results when the explore changes. */
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

/** Fetches event names when the event field, date range, or filters change. */
export const addRetentionEventFieldChangeListener = (
    startListening: typeof startAppListening,
) => {
    startListening({
        predicate: (_, currentState, previousState) => {
            const prev = previousState.retentionBuilder;
            const curr = currentState.retentionBuilder;
            return (
                prev.projectUuid !== curr.projectUuid ||
                prev.eventNameFieldId !== curr.eventNameFieldId ||
                prev.timestampFieldId !== curr.timestampFieldId ||
                prev.dateRangePreset !== curr.dateRangePreset ||
                prev.customDateRange !== curr.customDateRange ||
                prev.filters !== curr.filters
            );
        },
        effect: async (_, listenerApi) => {
            const request = buildEventNamesRequest(
                listenerApi.getState().retentionBuilder,
            );
            if (request) {
                await listenerApi.dispatch(fetchRetentionEventNames(request));
            }
        },
    });
};
