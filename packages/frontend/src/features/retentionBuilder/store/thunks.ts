import {
    isApiError,
    type ApiErrorDetail,
    type RetentionQueryResult,
} from '@lightdash/common';
import { createAsyncThunk } from '@reduxjs/toolkit';
import { sharedLightdashApi } from '../../../api';
import type { RootState } from '../../sqlRunner/store';
import { buildRetentionQueryRequest } from '../utils/retentionConfig';

export const fetchRetentionEventNames = createAsyncThunk<
    string[],
    {
        projectUuid: string;
        exploreName: string;
        eventDimensionId: string;
        timestampFieldId: string;
    },
    { rejectValue: ApiErrorDetail }
>(
    'retentionBuilder/fetchEventNames',
    async (
        { projectUuid, exploreName, eventDimensionId, timestampFieldId },
        { rejectWithValue },
    ) => {
        try {
            return await sharedLightdashApi<string[]>({
                url: `/projects/${projectUuid}/retention/event-names?exploreName=${exploreName}&eventDimensionId=${eventDimensionId}&timestampFieldId=${timestampFieldId}`,
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

export const runRetentionQuery = createAsyncThunk<
    RetentionQueryResult,
    void,
    { state: RootState; rejectValue: ApiErrorDetail }
>(
    'retentionBuilder/runRetentionQuery',
    async (_, { getState, rejectWithValue }) => {
        const state = getState();
        const rb = state.retentionBuilder;
        const request = buildRetentionQueryRequest(rb);
        if (!request) {
            return rejectWithValue({
                statusCode: 400,
                name: 'ParameterError',
                message: 'Retention configuration is incomplete',
                data: {},
            });
        }

        try {
            return await sharedLightdashApi<RetentionQueryResult>({
                url: `/projects/${rb.projectUuid}/retention/query`,
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
