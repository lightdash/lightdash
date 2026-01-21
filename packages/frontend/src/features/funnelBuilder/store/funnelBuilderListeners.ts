import { canRunFunnelQuery } from '../utils/funnelChartConfig';
import {
    clearResults,
    resetSteps,
    setEventNameFieldId,
    setExploreName,
} from './funnelBuilderSlice';
import { type startAppListening } from './listenerMiddleware';
import { fetchEventNames, runFunnelQuery } from './thunks';

/**
 * Auto-run query when configuration becomes valid and changes.
 */
export const addFunnelConfigChangeListener = (
    startListening: typeof startAppListening,
) => {
    startListening({
        predicate: (_, currentState, previousState) => {
            const prev = previousState.funnelBuilder;
            const curr = currentState.funnelBuilder;

            // Check if query-relevant config changed
            return (
                prev.projectUuid !== curr.projectUuid ||
                prev.steps !== curr.steps ||
                prev.dateRangePreset !== curr.dateRangePreset ||
                prev.customDateRange !== curr.customDateRange ||
                prev.conversionWindowValue !== curr.conversionWindowValue ||
                prev.conversionWindowUnit !== curr.conversionWindowUnit ||
                prev.breakdownDimensionId !== curr.breakdownDimensionId
            );
        },
        effect: async (_, listenerApi) => {
            const state = listenerApi.getState();
            const fb = state.funnelBuilder;

            const customDateRange: [Date | null, Date | null] = [
                fb.customDateRange[0] ? new Date(fb.customDateRange[0]) : null,
                fb.customDateRange[1] ? new Date(fb.customDateRange[1]) : null,
            ];

            if (
                canRunFunnelQuery({
                    projectUuid: fb.projectUuid,
                    exploreName: fb.exploreName,
                    timestampFieldId: fb.timestampFieldId,
                    userIdFieldId: fb.userIdFieldId,
                    eventNameFieldId: fb.eventNameFieldId,
                    steps: fb.steps,
                    dateRangePreset: fb.dateRangePreset,
                    customDateRange,
                })
            ) {
                await listenerApi.dispatch(runFunnelQuery());
            }
        },
    });
};

/**
 * Invalidate results and steps when explore changes.
 */
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

/**
 * Fetch event names when event field changes.
 */
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
