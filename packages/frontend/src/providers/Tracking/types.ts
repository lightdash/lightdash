import { type SearchItemType, type TimeFrames } from '@lightdash/common';
import { type FormState } from 'react-hook-form';
import type * as rudderSDK from 'rudder-sdk-js';
import {
    type CategoryName,
    type EventName,
    type PageName,
    type PageType,
    type SectionName,
} from '../../types/Events';

type GenericEvent = {
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
        | EventName.FORMAT_METRIC_BUTTON_CLICKED
        | EventName.CREATE_QUICK_TABLE_CALCULATION_BUTTON_CLICKED
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
        | EventName.DATE_ZOOM_CLICKED
        | EventName.COMMENTS_CLICKED
        | EventName.EMBED_DOWNLOAD_CSV_CLICKED
        | EventName.EMBED_DOWNLOAD_IMAGE_CLICKED
        | EventName.DOWNLOAD_IMAGE_CLICKED
        | EventName.NOTIFICATIONS_COMMENTS_ITEM_CLICKED
        | EventName.DASHBOARD_AUTO_REFRESH_UPDATED
        | EventName.METRICS_CATALOG_CLICKED
        | EventName.METRICS_CATALOG_CHART_USAGE_CLICKED
        | EventName.METRICS_CATALOG_EXPLORE_CLICKED
        | EventName.METRICS_CATALOG_CHART_USAGE_CHART_CLICKED
        | EventName.METRICS_CATALOG_CATEGORY_CLICKED
        | EventName.METRICS_CATALOG_CATEGORY_FILTER_APPLIED
        | EventName.METRICS_CATALOG_ICON_APPLIED
        | EventName.METRICS_CATALOG_EXPLORE_COMPARE_LAST_PERIOD
        | EventName.METRICS_CATALOG_EXPLORE_COMPARE_ANOTHER_METRIC
        | EventName.METRICS_CATALOG_EXPLORE_DATE_FILTER_APPLIED
        | EventName.METRICS_CATALOG_EXPLORE_GRANULARITY_APPLIED
        | EventName.METRICS_CATALOG_EXPLORE_SEGMENT_BY_APPLIED
        | EventName.METRICS_CATALOG_EXPLORE_TIME_DIMENSION_OVERRIDE_APPLIED
        | EventName.METRICS_CATALOG_SEARCH_APPLIED
        | EventName.METRICS_CATALOG_TREES_EDGE_CREATED
        | EventName.METRICS_CATALOG_TREES_EDGE_REMOVED
        | EventName.METRICS_CATALOG_TREES_CANVAS_MODE_CLICKED;
    properties?: {};
};

type DocumentationClickedEvent = {
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

export type LandingRunQueryClickedEvent = {
    name: EventName.LANDING_RUN_QUERY_CLICKED;
    properties: {
        organizationId: string;
        projectId: string;
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
        type: SearchItemType;
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

export type DashboardAutoRefreshUpdateEvent = {
    name: EventName.DASHBOARD_AUTO_REFRESH_UPDATED;
    properties: {
        organizationId: string;
        userId: string;
        projectId: string;
        dashboardId: string;
        frequency: string;
    };
};

type MetricsCatalogClickedEvent = {
    name: EventName.METRICS_CATALOG_CLICKED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
    };
};

type MetricsCatalogChartUsageClickedEvent = {
    name: EventName.METRICS_CATALOG_CHART_USAGE_CLICKED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
        metricName: string;
        chartCount: number;
        tableName: string;
    };
};

type MetricsCatalogExploreClickedEvent = {
    name: EventName.METRICS_CATALOG_EXPLORE_CLICKED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
        metricName: string;
        tableName: string;
    };
};

type MetricsCatalogChartUsageChartClickedEvent = {
    name: EventName.METRICS_CATALOG_CHART_USAGE_CHART_CLICKED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
        metricName: string;
        tableName: string;
        chartId: string;
    };
};

type MetricsCatalogCategoryClickedEvent = {
    name: EventName.METRICS_CATALOG_CATEGORY_CLICKED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
        tagName: string;
        isNewTag: boolean;
    };
};

type MetricsCatalogCategoryFilterAppliedEvent = {
    name: EventName.METRICS_CATALOG_CATEGORY_FILTER_APPLIED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
    };
};

type MetricsCatalogIconAppliedEvent = {
    name: EventName.METRICS_CATALOG_ICON_APPLIED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
    };
};

type MetricsCatalogExploreCompareLastPeriodEvent = {
    name: EventName.METRICS_CATALOG_EXPLORE_COMPARE_LAST_PERIOD;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
        metricName: string;
        tableName: string;
    };
};

type MetricsCatalogExploreCompareAnotherMetricEvent = {
    name: EventName.METRICS_CATALOG_EXPLORE_COMPARE_ANOTHER_METRIC;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
        metricName: string;
        tableName: string;
        compareMetricName: string;
        compareTableName: string;
    };
};

type MetricsCatalogExploreDateFilterAppliedEvent = {
    name: EventName.METRICS_CATALOG_EXPLORE_DATE_FILTER_APPLIED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
    };
};

type MetricsCatalogExploreGranularityAppliedEvent = {
    name: EventName.METRICS_CATALOG_EXPLORE_GRANULARITY_APPLIED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
        metricName: string;
        tableName: string;
        granularity: TimeFrames;
    };
};

type MetricsCatalogExploreSegmentByAppliedEvent = {
    name: EventName.METRICS_CATALOG_EXPLORE_SEGMENT_BY_APPLIED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
        metricName: string;
        tableName: string;
        segmentDimension: string;
    };
};

type MetricsCatalogExploreTimeDimensionOverrideAppliedEvent = {
    name: EventName.METRICS_CATALOG_EXPLORE_TIME_DIMENSION_OVERRIDE_APPLIED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
        metricName: string;
        tableName: string;
    };
};

type MetricsCatalogSearchAppliedEvent = {
    name: EventName.METRICS_CATALOG_SEARCH_APPLIED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
    };
};

type MetricsCatalogTreesEdgeCreatedEvent = {
    name: EventName.METRICS_CATALOG_TREES_EDGE_CREATED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
    };
};

type MetricsCatalogTreesEdgeRemovedEvent = {
    name: EventName.METRICS_CATALOG_TREES_EDGE_REMOVED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
    };
};

type MetricsCatalogTreesCanvasModeClickedEvent = {
    name: EventName.METRICS_CATALOG_TREES_CANVAS_MODE_CLICKED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
    };
};

type WriteBackEvent = {
    name:
        | EventName.WRITE_BACK_FROM_CUSTOM_METRIC_HEADER_CLICKED
        | EventName.WRITE_BACK_FROM_CUSTOM_METRIC_CLICKED
        | EventName.WRITE_BACK_FROM_CUSTOM_DIMENSION_HEADER_CLICKED
        | EventName.WRITE_BACK_FROM_CUSTOM_DIMENSION_CLICKED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
        customMetricsCount?: number;
        customDimensionsCount?: number;
    };
};

type CustomMetricReplacementEvent = {
    name: EventName.CUSTOM_FIELDS_REPLACEMENT_APPLIED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
        chartId?: string;
        customMetricIds: string[];
    };
};

type DashboardChartLoadedEvent = {
    name: EventName.DASHBOARD_CHART_LOADED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
        dashboardId: string;
        chartId: string;
        queryId: string;
        warehouseExecutionTimeMs: number | undefined;
        totalTimeMs: number | undefined;
        totalResults: number;
        loadedRows: number;
        // cacheMetadata: CacheMetadata;
    };
};

type SpaceBreadcrumbClickedEvent = {
    name: EventName.SPACE_BREADCRUMB_CLICKED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
    };
};

// AI Agent Events
type AiAgentCreatedEvent = {
    name: EventName.AI_AGENT_CREATED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
        aiAgentId: string;
        agentName: string;
    };
};

type AiAgentDeletedEvent = {
    name: EventName.AI_AGENT_DELETED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
        aiAgentId: string;
        agentName: string;
    };
};

type AiAgentUpdatedEvent = {
    name: EventName.AI_AGENT_UPDATED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
        aiAgentId: string;
        agentName: string;
    };
};

type AiAgentPromptCreatedEvent = {
    name: EventName.AI_AGENT_PROMPT_CREATED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
        aiAgentId: string;
        threadId: string | undefined;
    };
};

type AiAgentChartHowItsCalculatedClickedEvent = {
    name: EventName.AI_AGENT_CHART_HOW_ITS_CALCULATED_CLICKED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
        aiAgentId: string;
        threadId: string;
        messageId: string;
        chartType: string;
    };
};

type AiAgentChartCreatedEvent = {
    name: EventName.AI_AGENT_CHART_CREATED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
        aiAgentId: string;
        threadId: string;
        messageId: string;
        tableName: string;
    };
};

type AiAgentChartExploredEvent = {
    name: EventName.AI_AGENT_CHART_EXPLORED;
    properties: {
        userId: string;
        organizationId: string;
        projectId: string;
        aiAgentId: string;
        threadId: string;
        messageId: string;
        tableName: string;
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
    | DrillByClickedEvent
    | DashboardAutoRefreshUpdateEvent
    | MetricsCatalogClickedEvent
    | MetricsCatalogChartUsageClickedEvent
    | MetricsCatalogExploreClickedEvent
    | MetricsCatalogChartUsageChartClickedEvent
    | MetricsCatalogCategoryClickedEvent
    | MetricsCatalogCategoryFilterAppliedEvent
    | MetricsCatalogIconAppliedEvent
    | MetricsCatalogExploreCompareLastPeriodEvent
    | MetricsCatalogExploreCompareAnotherMetricEvent
    | MetricsCatalogExploreDateFilterAppliedEvent
    | MetricsCatalogExploreGranularityAppliedEvent
    | MetricsCatalogExploreSegmentByAppliedEvent
    | MetricsCatalogExploreTimeDimensionOverrideAppliedEvent
    | MetricsCatalogSearchAppliedEvent
    | LandingRunQueryClickedEvent
    | MetricsCatalogTreesEdgeCreatedEvent
    | MetricsCatalogTreesEdgeRemovedEvent
    | MetricsCatalogTreesCanvasModeClickedEvent
    | WriteBackEvent
    | DashboardChartLoadedEvent
    | CustomMetricReplacementEvent
    | SpaceBreadcrumbClickedEvent
    | AiAgentCreatedEvent
    | AiAgentDeletedEvent
    | AiAgentUpdatedEvent
    | AiAgentPromptCreatedEvent
    | AiAgentChartHowItsCalculatedClickedEvent
    | AiAgentChartCreatedEvent
    | AiAgentChartExploredEvent;

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

export type TrackingContextType = { data: TrackingData } & TrackingActions;
