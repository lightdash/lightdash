import {
    isApiError,
    type ApiErrorDetail,
    type FunnelQueryResult,
} from '@lightdash/common';
import { createAsyncThunk } from '@reduxjs/toolkit';
import { lightdashApi } from '../../../api';
import type { RootState } from '../../sqlRunner/store';
import {
    buildDateRange,
    buildFunnelQueryRequest,
} from '../utils/funnelChartConfig';

export const fetchEventNames = createAsyncThunk<
    string[],
    {
        projectUuid: string;
        exploreName: string;
        eventDimensionId: string;
        timestampFieldId: string;
    },
    { rejectValue: ApiErrorDetail }
>(
    'funnelBuilder/fetchEventNames',
    async (
        { projectUuid, exploreName, eventDimensionId, timestampFieldId },
        { rejectWithValue },
    ) => {
        try {
            return await lightdashApi<string[]>({
                url: `/projects/${projectUuid}/funnel/event-names?exploreName=${exploreName}&eventDimensionId=${eventDimensionId}&timestampFieldId=${timestampFieldId}`,
                method: 'GET',
                body: undefined,
            });
        } catch (error) {
            if (isApiError(error)) {
                return rejectWithValue(error.error);
            }
            throw error;
        }
    },
);

export const runFunnelQuery = createAsyncThunk<
    FunnelQueryResult,
    void,
    { state: RootState; rejectValue: ApiErrorDetail }
>('funnelBuilder/runFunnelQuery', async (_, { getState, rejectWithValue }) => {
    const state = getState();
    const fb = state.funnelBuilder;

    const dateRange = buildDateRange(fb.dateRangePreset, [
        fb.customDateRange[0] ? new Date(fb.customDateRange[0]) : null,
        fb.customDateRange[1] ? new Date(fb.customDateRange[1]) : null,
    ]);

    const request = buildFunnelQueryRequest({
        exploreName: fb.exploreName!,
        timestampFieldId: fb.timestampFieldId!,
        userIdFieldId: fb.userIdFieldId!,
        eventNameFieldId: fb.eventNameFieldId!,
        steps: fb.steps,
        dateRange,
        conversionWindowValue: fb.conversionWindowValue,
        conversionWindowUnit: fb.conversionWindowUnit,
        breakdownDimensionId: fb.breakdownDimensionId,
    });

    try {
        return (await lightdashApi<null>({
            url: `/projects/${fb.projectUuid}/funnel/query`,
            method: 'POST',
            body: JSON.stringify(request),
        })) as unknown as FunnelQueryResult;
    } catch (error) {
        if (isApiError(error)) {
            return rejectWithValue(error.error);
        }
        throw error;
    }
});
