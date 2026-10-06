export enum AiEgressSurface {
    AGENT_THREAD_HISTORY = 'agent_thread_history',
    AGENT_MEMORY = 'agent_memory',
    AGENT_JUDGE = 'agent_judge',
    SCHEDULED_DELIVERY_SUMMARY = 'scheduled_delivery_summary',
    DATA_APP_BUILD = 'data_app_build',
    DATA_APP_ANALYSIS = 'data_app_analysis',
    BROWSER_UPLOAD = 'browser_upload',
    TYPESAFE_DECISION = 'typesafe_decision',
    RESULTS_CACHE = 'results_cache',
    FIELD_VALUE_SEARCH = 'field_value_search',
    WAREHOUSE_METADATA_TOOL = 'warehouse_metadata_tool',
    SLACK_AGENT = 'slack_agent',
}

export enum AiEgressBlockReason {
    ROWS_NOT_FETCHED_BY_AI_SIGN_IN = 'rows_not_fetched_by_ai_sign_in',
    METADATA_ONLY = 'metadata_only',
    OFF_UNDER_RESTRICTIONS = 'off_under_restrictions',
    SHARED_CACHE_SKIPPED = 'shared_cache_skipped',
}

export type AiEgressBlock = {
    surface: AiEgressSurface;
    reason: AiEgressBlockReason;
    organizationUuid: string | null;
    projectUuid: string | null;
    userUuid: string | null;
    detail: string | null;
};
