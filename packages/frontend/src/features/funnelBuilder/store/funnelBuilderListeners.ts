import { buildEventNamesRequest } from '../../eventAnalytics/utils/eventNames';
import { buildFunnelQueryRequest } from '../utils/funnelChartConfig';
import { clearResults, resetSteps, setExploreName } from './funnelBuilderSlice';
import { type startAppListening } from './listenerMiddleware';
import { fetchEventNames, runFunnelQuery } from './thunks';

/** Runs the query whenever the configuration changes and is complete. */
export const addFunnelConfigChangeListener = (
    startListening: typeof startAppListening,
) => {
    startListening({
        predicate: (_, currentState, previousState) => {
            const prev = previousState.funnelBuilder;
            const curr = currentState.funnelBuilder;

            return (
                prev.projectUuid !== curr.projectUuid ||
                prev.steps !== curr.steps ||
                prev.dateRangePreset !== curr.dateRangePreset ||
                prev.customDateRange !== curr.customDateRange ||
                prev.filters !== curr.filters ||
                prev.conversionWindowValue !== curr.conversionWindowValue ||
                prev.conversionWindowUnit !== curr.conversionWindowUnit ||
                prev.breakdownDimensionId !== curr.breakdownDimensionId
            );
        },
        effect: async (_, listenerApi) => {
            if (buildFunnelQueryRequest(listenerApi.getState().funnelBuilder)) {
                await listenerApi.dispatch(runFunnelQuery());
            }
        },
    });
};

/** Clears results and steps when the explore changes. */
export const addFieldChangeInvalidationListener = (
    startListening: typeof startAppListening,
) => {
    startListening({
        actionCreator: setExploreName,
        effect: (_, listenerApi) => {
            listenerApi.dispatch(clearResults());
            listenerApi.dispatch(resetSteps());
        },
    });
};

/** Fetches event names when the event field, date range, or filters change. */
export const addEventFieldChangeListener = (
    startListening: typeof startAppListening,
) => {
    startListening({
        predicate: (_, currentState, previousState) => {
            const prev = previousState.funnelBuilder;
            const curr = currentState.funnelBuilder;
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
                listenerApi.getState().funnelBuilder,
            );
            if (request) {
                await listenerApi.dispatch(fetchEventNames(request));
            }
        },
    });
};
