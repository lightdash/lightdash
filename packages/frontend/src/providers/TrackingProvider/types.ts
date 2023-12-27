import { FormState } from 'react-hook-form';
import * as rudderSDK from 'rudder-sdk-js';
import {
    CategoryName,
    EventName,
    PageName,
    PageType,
    SectionName,
} from '../../types/Events';

export type GenericEvent = {
    name:
        | EventName.REVOKE_INVITES_BUTTON_CLICKED
        | EventName.INVITE_BUTTON_CLICKED
        | EventName.RUN_QUERY_BUTTON_CLICKED
        | EventName.UPDATE_DASHBOARD_NAME_CLICKED
        | EventName.ADD_COLUMN_BUTTON_CLICKED
        | EventName.CONFIRM_DELETE_TABLE_CALCULATION_BUTTON_CLICKED
        | EventName.DELETE_TABLE_CALCULATION_BUTTON_CLICKED
        | EventName.EDIT_TABLE_CALCULATION_BUTTON_CLICKED
        | EventName.CREATE_PROJECT_BUTTON_CLICKED
        | EventName.REFRESH_DBT_CONNECTION_BUTTON_CLICKED
        | EventName.UPDATE_PROJECT_TABLES_CONFIGURATION_BUTTON_CLICKED
        | EventName.UPDATE_PROJECT_BUTTON_CLICKED
        | EventName.UPDATE_TABLE_CALCULATION_BUTTON_CLICKED
        | EventName.CREATE_TABLE_CALCULATION_BUTTON_CLICKED
        | EventName.ADD_FILTER_CLICKED
        | EventName.NOTIFICATIONS_CLICKED
        | EventName.NOTIFICATIONS_ITEM_CLICKED
        | EventName.NOTIFICATIONS_READ_MORE_CLICKED
        | EventName.ADD_CUSTOM_METRIC_CLICKED
        | EventName.REMOVE_CUSTOM_METRIC_CLICKED
        | EventName.CUSTOM_AXIS_RANGE_TOGGLE_CLICKED
        | EventName.CREATE_PROJECT_ACCESS_BUTTON_CLICKED
        | EventName.CREATE_PROJECT_CLI_BUTTON_CLICKED
        | EventName.CREATE_PROJECT_MANUALLY_BUTTON_CLICKED
        | EventName.COPY_CREATE_PROJECT_CODE_BUTTON_CLICKED
        | EventName.TRY_DEMO_CLICKED
        | EventName.GO_TO_LINK_CLICKED
        | EventName.USAGE_ANALYTICS_CLICKED
        | EventName.VIEW_UNDERLYING_DATA_CLICKED
        | EventName.DRILL_BY_CLICKED
        | EventName.SCHEDULER_SEND_NOW_BUTTON
        | EventName.ADD_CUSTOM_DIMENSION_CLICKED
        | EventName.DATE_ZOOM_CLICKED;
    properties?: {};
};

export type DocumentationClickedEvent = {
    name: EventName.DOCUMENTATION_BUTTON_CLICKED;
    properties: {
        action:
            | 'invite_user'
            | 'save_chart'
            | 'run_query'
            | 'define_metrics'
            | 'connect_project'
            | 'getting_started';
    };
};

export type OnboardingStepClickedEvent = {
    name: EventName.ONBOARDING_STEP_CLICKED;
    properties: {
        action:
            | 'invite_user'
            | 'save_chart'
            | 'run_query'
            | 'define_metrics'
            | 'connect_project';
    };
};

export type SetupStepClickedEvent = {
    name: EventName.SETUP_STEP_CLICKED;
    properties: {
        action: 'create_user' | 'create_project';
    };
};

export type SearchResultClickedEvent = {
    name: EventName.SEARCH_RESULT_CLICKED;
    properties: {
        type:
            | 'space'
            | 'dashboard'
            | 'saved_chart'
            | 'table'
            | 'field'
            | 'page';
        id: string;
    };
};

export type GlobalSearchOpenEvent = {
    name: EventName.GLOBAL_SEARCH_OPEN;
    properties: {
        action: 'input_click' | 'hotkeys';
    };
};

export type GlobalSearchClosedEvent = {
    name: EventName.GLOBAL_SEARCH_CLOSED;
    properties: {
        action: 'result_click' | 'default';
    };
};

export type FormClickedEvent = {
    name: EventName.FORM_STATE_CHANGED;
    properties: {
        form: string;
        formState: FormState<any>;
    };
};

export type CrossFilterDashboardAppliedEvent = {
    name: EventName.CROSS_FILTER_DASHBOARD_APPLIED;
    properties: {
        fieldType: string | undefined;
        dashboardId: string;
        projectId: string;
    };
};

export type ViewUnderlyingDataClickedEvent = {
    name: EventName.VIEW_UNDERLYING_DATA_CLICKED;
    properties: {
        organizationId: string;
        userId: string;
        projectId: string;
    };
};

export type DrillByClickedEvent = {
    name: EventName.DRILL_BY_CLICKED;
    properties: {
        organizationId: string;
        userId: string;
        projectId: string;
    };
};

export type EventData =
    | GenericEvent
    | FormClickedEvent
    | SetupStepClickedEvent
    | DocumentationClickedEvent
    | SearchResultClickedEvent
    | GlobalSearchOpenEvent
    | GlobalSearchClosedEvent
    | OnboardingStepClickedEvent
    | CrossFilterDashboardAppliedEvent
    | ViewUnderlyingDataClickedEvent
    | DrillByClickedEvent;

export type IdentifyData = {
    id: string;
    traits?: Record<string, any>;
};

export interface PageData {
    name: PageName;
    category?: CategoryName;
    type?: PageType;
}

export interface SectionData {
    name: SectionName;
}

export interface TrackingData {
    rudder?: typeof rudderSDK;
    page?: PageData;
    section?: SectionData;
}

export interface TrackingActions {
    track: (event: EventData) => void;
    page: (event: PageData) => void;
    identify: (event: IdentifyData) => void;
}
