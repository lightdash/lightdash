import { buildFunnelQueryRequest } from '../utils/funnelChartConfig';
import {
    clearResults,
    resetSteps,
    setEventNameFieldId,
    setExploreName,
} from './funnelBuilderSlice';
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

/** Fetches event names when the event field changes. */
export const addEventFieldChangeListener = (
    startListening: typeof startAppListening,
) => {
    startListening({
        actionCreator: setEventNameFieldId,
        effect: async (action, listenerApi) => {
            const state = listenerApi.getState();
            const { projectUuid, exploreName, timestampFieldId } =
                state.funnelBuilder;

            if (
                action.payload &&
                projectUuid &&
                exploreName &&
                timestampFieldId
            ) {
                await listenerApi.dispatch(
                    fetchEventNames({
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
