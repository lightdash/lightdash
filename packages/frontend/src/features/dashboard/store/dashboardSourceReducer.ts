import {
    type ApiError,
    type Dashboard,
    type DashboardAvailableFilters,
    type InteractivityOptions,
} from '@lightdash/common';
import { createAction, type UnknownAction } from '@reduxjs/toolkit';
import {
    type useDashboardCommentsCheck,
    type useGetComments,
} from '../../comments';

/** What the provider loads (react-query, route, props) and mirrors into the store */
export type DashboardProviderState = {
    projectUuid: string | undefined;
    includeUnpublishedDraft: boolean;
    embedToken: string | undefined;
    /** From the dashboard query; embeds set `embedDashboard` instead */
    queryDashboard: Dashboard | undefined;
    isDashboardLoading: boolean;
    dashboardError: ApiError | null;
    availableFilters: DashboardAvailableFilters | undefined;
    isLoadingDashboardFilters: boolean;
    isFetchingDashboardFilters: boolean;
    dashboardCommentsCheck:
        | ReturnType<typeof useDashboardCommentsCheck>
        | undefined;
    dashboardComments: ReturnType<typeof useGetComments>['data'];
    refreshDashboardVersion: () => Promise<void>;
};

export type DashboardSourceState = DashboardProviderState & {
    embedDashboard: (Dashboard & InteractivityOptions) | undefined;
};

export const initialDashboardProviderState: DashboardProviderState = {
    projectUuid: undefined,
    includeUnpublishedDraft: false,
    embedToken: undefined,
    queryDashboard: undefined,
    isDashboardLoading: false,
    dashboardError: null,
    availableFilters: undefined,
    isLoadingDashboardFilters: false,
    isFetchingDashboardFilters: false,
    dashboardCommentsCheck: undefined,
    dashboardComments: undefined,
    refreshDashboardVersion: async () => {},
};

export const initialDashboardSourceState: DashboardSourceState = {
    ...initialDashboardProviderState,
    embedDashboard: undefined,
};

export const dashboardSourceActions = {
    sync: createAction<DashboardProviderState>('source/sync'),
    setEmbedDashboard: createAction<
        (Dashboard & InteractivityOptions) | undefined
    >('source/setEmbedDashboard'),
};

const isUnchanged = (
    state: DashboardSourceState,
    payload: DashboardProviderState,
) =>
    (Object.keys(payload) as (keyof DashboardProviderState)[]).every(
        (key) => state[key] === payload[key],
    );

// Plain reducer: Immer would freeze the react-query dashboard objects
export const dashboardSourceReducer = (
    state: DashboardSourceState = initialDashboardSourceState,
    action: UnknownAction,
): DashboardSourceState => {
    if (dashboardSourceActions.sync.match(action)) {
        return isUnchanged(state, action.payload)
            ? state
            : { ...state, ...action.payload };
    }
    if (dashboardSourceActions.setEmbedDashboard.match(action)) {
        return state.embedDashboard === action.payload
            ? state
            : { ...state, embedDashboard: action.payload };
    }
    return state;
};
