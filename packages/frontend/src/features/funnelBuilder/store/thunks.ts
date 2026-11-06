import {
    isApiError,
    type ApiErrorDetail,
    type EventNamesRequest,
    type FunnelQueryResult,
} from '@lightdash/common';
import { createAsyncThunk } from '@reduxjs/toolkit';
import { sharedLightdashApi } from '../../../api';
import type { RootState } from '../../sqlRunner/store';
import { buildFunnelQueryRequest } from '../utils/funnelChartConfig';

export const fetchEventNames = createAsyncThunk<
    string[],
    EventNamesRequest,
    { state: RootState; rejectValue: ApiErrorDetail }
>(
    'funnelBuilder/fetchEventNames',
    async (request, { getState, rejectWithValue }) => {
        const { projectUuid } = getState().funnelBuilder;
        try {
            return await sharedLightdashApi<string[]>({
                url: `/projects/${projectUuid}/event-analytics/event-names`,
                method: 'POST',
                body: JSON.stringify(request),
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
    const fb = getState().funnelBuilder;
    const request = buildFunnelQueryRequest(fb);
    if (!request) {
        return rejectWithValue({
            statusCode: 400,
            name: 'ParameterError',
            message: 'The funnel is not fully configured',
            data: {},
        });
    }

    try {
        return await sharedLightdashApi<FunnelQueryResult>({
            url: `/projects/${fb.projectUuid}/event-analytics/funnel`,
            method: 'POST',
            body: JSON.stringify(request),
        });
    } catch (error) {
        if (isApiError(error)) {
            return rejectWithValue(error.error);
        }
        throw error;
    }
});
