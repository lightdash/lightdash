import type { Dimension } from '@lightdash/common';

export const analyticsTableDescriptions: Record<string, string> = {
    query_events:
        'Query outcomes, with one recorded event per completed query attempt, including cache hits and execution errors. Use this Explore to investigate query volume, latency and workload origin. Preview projects and failures before query execution are excluded.',
    ai_usage:
        'AI model calls and their reported token usage across Lightdash features. One question can make several model calls. Use Agent requests to count Ask AI questions; use this Explore to compare models, features and token consumption, not monetary cost.',
    agent_steps:
        'Work performed while answering AI agent prompts: completed reasoning-loop steps and individual tool calls. Record type distinguishes these two kinds of rows. One prompt can produce many steps and tool calls; use Agent requests to count questions.',
    agent_request_events:
        'Individual changes during an AI agent request: creation, outcomes, retries, clarification waits, interruptions and feedback updates. A single prompt has several events. Use Agent requests for question counts, response times and current outcomes.',
    agent_requests:
        'One row per captured human prompt to the AI agent, combining its latest outcome, retries, feedback and model usage. Use this Explore for Ask AI questions and usage trends; filter Surface to web_app for in-app usage. Only prompts with a captured creation event are included.',
    data_app_events:
        'Recorded data app activity, including creation, updates, downloads and HTML loads. Use Event name to select an action. Loads include previews and reloads and do not confirm readership; Data app reach focuses on loads by named app and user.',
    export_events:
        'Result-download activity, with separate events for starts, completions and errors. Use Total downloads or Total csv downloads to count completed exports. Available query metadata links downloads to charts and dashboards; not all exports have that attribution.',
    user_activity:
        'Daily captured activity grouped by user, project, event type and export format across usage streams. Use this Explore to compare activity by person over time. Totals retain events without an identified user and automated activity; this is not a list of all eligible or inactive users.',
    tool_activity:
        'Individual tool invocations from external MCP clients and the in-app AI agent, including failures. Stable call identities remove duplicate deliveries. Use Source to distinguish MCP from agent calls; historical calls may have unknown outcomes or missing timings.',
    content_reach:
        'Captured chart and dashboard fetches, with audience and returning-viewer metrics. Qualifying views are successful backend fetches by identified users, excluding known previews and embeds. Refetches count; browser-cache-only visits are not captured. Data app loads are in Data app reach.',
    content_health:
        'The latest inventory of charts, dashboards and data apps, including items with no observed activity and soft-deleted items. Combines current ownership and known dependencies with retained usage. No observed activity does not prove an item is unused or safe to delete.',
    semantic_usage:
        'Direct field references in captured semantic queries, with one row per query, field and role. Use this Explore to find which metrics and dimensions are queried. Counts are distinct and cannot be summed across fields or roles; SQL-only and older queries may have no field details.',
    data_app_reach:
        'Recorded app HTML loads by app, user, date and viewing surface. Includes previews and reloads; filter View context to choose surfaces. A load does not confirm successful rendering or human attention. Identified embed loads have no known viewer.',
    people_adoption:
        'Current organization members, including people with no observed activity. Compare eligible membership with confirmed human activity over the last 1, 7 or 30 closed UTC days. Uses current membership, not historical eligibility; incomplete capture does not prove inactivity.',
    lightdash_users:
        'User names from the latest available organization snapshot, joined to recorded user identifiers. Names are current snapshot values, not a history of names or membership.',
    lightdash_charts:
        'Chart names, slugs and state from the latest available snapshot, joined to recorded chart identifiers.',
    lightdash_dashboards:
        'Dashboard names, slugs and state from the latest available snapshot, joined to recorded dashboard identifiers.',
    lightdash_agents:
        'AI agent names from the latest available snapshot, joined to recorded agent identifiers.',
    lightdash_apps:
        'App and project names from the latest content inventory, joined to recorded app identifiers.',
};

const sharedDimensions: Record<string, string> = {
    org_id: 'Identifier of the organization the activity belongs to.',
    project_id:
        'Identifier of the project associated with the activity or content.',
    user_id:
        'Recorded user identifier. It can be present even when a name is unavailable; a missing identifier means the event cannot be attributed to a registered user.',
    agent_id:
        'Identifier of the Lightdash AI agent associated with the activity, when captured.',
    thread_id: 'Identifier of the AI conversation containing the prompt.',
    prompt_id:
        'Identifier of an individual prompt. Use it to connect a request with its lifecycle events, steps and model calls.',
    chart_id:
        'Identifier of the chart associated with the activity, when captured.',
    dashboard_id:
        'Identifier of the dashboard associated with the activity, when captured.',
    app_id: 'Identifier of the data app associated with the activity, when captured.',
    query_id: 'Identifier of the query attempt associated with the activity.',
    event_id:
        'Stable identifier of a captured event, when available. Repeated delivery can retain the same identifier.',
    event_ts:
        'Time the event was recorded. Available history starts when capture was enabled and is limited by retention and completed processing.',
    event_name:
        'Recorded action or lifecycle event. Different event types can belong to the same user action, so counting all events is not the same as counting actions.',
    schema_version:
        'Version of the recorded event format. Older versions may lack newer fields.',
    context:
        'Execution context recorded by the caller, such as a dashboard, Explore or scheduled delivery. It does not by itself prove a human initiated the request.',
    explore_name: 'Name of the Explore used by the query, when available.',
    response_time_ms:
        'Backend time to the query outcome in milliseconds, including queueing and result storage. Excludes browser transfer and rendering; missing historical timings are not zero.',
    response_timing_basis:
        'Starting point for response time: request begins at the authenticated request; query_submission begins when the query is submitted and excludes earlier preparation.',
    workload_origin:
        'Attributed workload: interactive, scheduled, autorefresh, agent, app, mcp or unknown. Interactive describes the workflow, not proof of a human action.',
    dashboard_tile_id:
        'Identifier of the dashboard tile that initiated the query, when captured.',
    app_version:
        'Recorded app version that initiated the query, where validated version attribution is available.',
    request_id:
        'Server request identifier for correlating activity from the same request, when captured.',
    parent_operation_id:
        'Identifier linking activity to a parent operation, such as a scheduler job or trace, when captured.',
    initiating_actor_type:
        'Recorded type of initiator, distinguishing users, service accounts and anonymous activity where known.',
    scheduler_id:
        'Identifier of the scheduled delivery associated with the query, when captured.',
    semantic_lineage_status:
        'Whether direct field references were captured: captured, partial or unavailable. Missing on historical queries without field capture.',
    semantic_field_references:
        'Recorded direct semantic field references used to build Semantic usage. Does not include a complete dependency graph.',
    cache_hit:
        'Whether the query result came from the result cache instead of a new execution.',
    execution_source:
        'Source used to execute or serve the query, such as the warehouse, result cache or a pre-aggregate.',
    warehouse_type:
        'Warehouse or engine type recorded for the query execution.',
    connection_warehouse_type:
        'Warehouse type of the connection used by the query, when captured.',
    warehouse_connection_id:
        'Identifier of the warehouse connection used by the query, when captured.',
    connection_kind: 'Recorded connection category used by the query.',
    connection_count: 'Number of warehouse connections recorded for the query.',
    warehouse_execution_time_ms:
        'Reported warehouse execution time in milliseconds. This is a performance measure, not monetary cost; missing timing is not zero.',
    warehouse_ssh_tunnel_ms:
        'Time spent establishing the warehouse SSH tunnel, in milliseconds; absent when not reported.',
    warehouse_connect_ms:
        'Time spent connecting to the warehouse, in milliseconds; absent when not reported.',
    warehouse_session_ms:
        'Time spent preparing the warehouse session, in milliseconds; absent when not reported.',
    warehouse_query_ms:
        'Time spent running the warehouse query, in milliseconds; absent when not reported.',
    warehouse_fetch_ms:
        'Time spent fetching results from the warehouse, in milliseconds; absent when not reported.',
    total_row_count: 'Number of result rows reported for the query.',
    columns_count: 'Number of result columns reported for the query.',
    feature:
        'Lightdash feature responsible for the AI model call. Use this to separate agent activity from other AI features.',
    function_id:
        'Identifier of the operation that made the AI model call, when provided.',
    model: 'AI model used for the recorded call or agent step.',
    provider: 'Provider that served the AI model call.',
    model_provider: 'Provider that served the model used in the agent step.',
    key_management:
        'Whether the model call used Lightdash-managed or self-managed credentials, when known.',
    channel: 'Channel associated with the AI model call, when captured.',
    external_user_id:
        'External user identifier supplied for embedded AI usage, when available; not a registered Lightdash user UUID.',
    managed_agent_run_id:
        'Identifier of the managed agent run associated with the model call, when captured.',
    deep_research_run_id:
        'Identifier of the deep research run associated with the model call, when captured.',
    deep_research_phase:
        'Phase of deep research associated with the model call, when captured.',
    input_tokens:
        'Reported input token usage. Missing usage is unknown, not zero; provider token categories may overlap.',
    output_tokens:
        'Reported output token usage. Missing usage is unknown, not zero; provider token categories may overlap.',
    cache_read_tokens:
        'Reported input tokens read from the model provider cache. Do not add to input tokens without checking the provider accounting.',
    cache_write_tokens:
        'Reported input tokens written to the model provider cache. Do not add to input tokens without checking the provider accounting.',
    reasoning_tokens:
        'Reported reasoning-token usage, where supported by the model provider. May overlap other token categories.',
    total_tokens:
        'Reported total token usage. Missing usage is unknown, not zero; tokens do not represent monetary cost.',
    record_type:
        'Whether this row describes a completed agent loop step or an individual completed tool call. Fields specific to the other row type are empty.',
    step_index: 'Position of the loop step within the agent response.',
    step_offset_ms:
        'Elapsed time from the start of the agent response to this step, in milliseconds.',
    step_total_ms:
        'Total elapsed time for the agent loop step, in milliseconds.',
    inference_ms:
        'Time spent on model inference during the step, in milliseconds.',
    tool_wall_ms:
        'Elapsed time spent running tools during the step, in milliseconds. Parallel calls mean this need not equal the sum of individual durations.',
    ttft_ms:
        'Time to the first model token during the step, in milliseconds, when reported.',
    tool_call_count: 'Number of tool calls recorded for this agent step.',
    reasoning_chars:
        'Number of reasoning-text characters recorded for this step; not a token count.',
    tool_call_id: 'Identifier of an individual tool invocation, when captured.',
    tool_name: 'Name of the invoked tool.',
    tool_duration_ms:
        'Elapsed time for the individual tool invocation, in milliseconds.',
    tool_stage: 'Execution stage recorded for the tool call.',
    query_cache_hit:
        'Whether the tool reported a query result cache hit, when applicable.',
    query_reuse_hit:
        'Whether the tool reused an earlier query, when applicable.',
    tool_status:
        'Recorded success or error outcome of the tool invocation. Missing historical outcomes are unknown.',
    version: 'Data app version associated with the recorded activity.',
    format: 'Requested result-export format, such as csv. Empty for activity without an export format.',
    job_id: 'Identifier of the download job associated with the export event, when captured.',
    table_id:
        'Table identifier recorded for the result export, when available.',
    num_rows:
        'Number of exported result rows reported by the event, when available.',
    stage: 'Request lifecycle change: created, outcome, retry_started, clarification_requested, interrupted or feedback_updated. Several stages can belong to one prompt.',
    surface:
        'Where the AI request originated. Filter to web_app for in-app Ask AI usage. Lifecycle events other than creation may not carry this value.',
    human_score:
        'Feedback recorded by this event: 1 for positive, -1 for negative, and 0 for a removed rating. Empty on events without feedback.',
    activity_date:
        'UTC day of the captured activity. These are daily summaries, not individual event timestamps.',
    stream: 'Usage event family contributing to the daily summary, such as queries, AI calls or downloads.',
    event_count:
        'Number of recorded events represented by this daily summary row, including lifecycle and automated events.',
    query_count:
        'Number of recorded query outcomes represented by this daily summary row.',
    source: 'Origin of the tool invocation: mcp for external MCP clients or agent for the in-app AI agent.',
    actor_id:
        'Identifier of the recorded actor, including service principals where available. It is not always a registered user identifier.',
    actor_type:
        'Type of actor recorded for the activity. Unknown means the type was not captured; it should not be assumed to be a human.',
    client_name: 'MCP client name reported by the caller, when available.',
    client_version:
        'MCP client version reported by the caller, when available.',
    auth_type: 'Authentication method used for the MCP call, when captured.',
    session_id:
        'Identifier of the MCP session associated with the call, when captured.',
    duration_ms:
        'Observed duration of the tool invocation, in milliseconds. Missing historical timings are not zero.',
    content_id:
        'Identifier of the content item. Use together with project and content type to distinguish items.',
    content_name: 'Name of the content item.',
    content_type:
        'Kind of content item, such as a chart, dashboard or data app.',
    project_name: 'Name of the project associated with the content.',
    space_id: 'Identifier of the space containing the content, when available.',
    space_name: 'Name of the space containing the content, when available.',
    ingested_at:
        'Time the content-view event was captured by the analytics pipeline.',
    content_created_at:
        'Content creation time recorded with the view. Creation is not a known launch date.',
    is_verified:
        'Whether the content was marked as verified. Unknown or unsupported verification states remain empty.',
    is_qualifying:
        'Whether the captured fetch has qualifying backend-view context. Audience metrics additionally require an identified registered user.',
    qualifying_view_at:
        'Time of a qualifying backend content fetch by an identified user; empty for nonqualifying events.',
    viewer_id:
        'Registered user identifier on a qualifying content fetch; empty for other activity.',
    returning_viewer_id:
        'User identifier when a qualifying visit occurs on a later UTC day than their first retained visit to this content.',
    first_week_returning_viewer_id:
        'User identifier for a later visit by someone first seen during the first seven UTC calendar days from content creation.',
    known_verification_viewer_id:
        'Qualifying viewer identifier where the content verification state is known.',
    verified_viewer_id:
        'Qualifying viewer identifier where the content was verified at the time of the visit.',
    first_view_day:
        'First retained qualifying UTC visit day for this user and content, calculated before date filters. Earlier uncaptured visits are unknown.',
    creation_week:
        'Week the content was created, not necessarily the week it was launched.',
    weeks_since_creation:
        'Whole seven-day periods between content creation and this recorded event.',
    owner_id:
        'Owner identifier from the latest content snapshot, when ownership is available.',
    owner_name:
        'Owner name from the latest content snapshot, when ownership is available.',
    created_at: 'Content creation time from the latest inventory snapshot.',
    deleted_at:
        'Content soft-deletion time from the latest inventory snapshot, when present.',
    snapshot_at:
        'Time the current inventory snapshot was generated. Ownership, names and dependency counts reflect that snapshot.',
    is_deleted:
        'Whether the content is soft-deleted in the latest snapshot. Filter to false to exclude it.',
    dashboard_references:
        'Number of current dashboard-tile references recorded for this item. This is only part of its possible dependencies.',
    enabled_schedules:
        'Number of enabled scheduled deliveries recorded for this item. This does not confirm successful delivery or readership.',
    last_viewed_at:
        'Latest retained qualifying chart or dashboard fetch for this item.',
    last_query_at: 'Latest retained query outcome attributed to this item.',
    last_app_load_at:
        'Latest retained HTML load for this data app, including previews and reloads.',
    last_observed_activity_at:
        'Latest retained content fetch, attributed query or app load for this item.',
    observed_views:
        'Qualifying chart or dashboard fetches for this item across retained history. App loads are counted separately.',
    observed_queries:
        'Retained query outcomes attributed to this item. A chart query can also be attributed to its dashboard.',
    observed_app_loads:
        'Retained HTML loads for this data app, including previews and reloads; not confirmed readership.',
    queries_with_execution_time:
        'Retained attributed query outcomes with reported warehouse timing.',
    days_since_last_observed_activity:
        'Days from the latest retained activity to query time. Empty when no activity was observed; does not prove inactivity before capture.',
    activity_status:
        'Whether activity or a known dependency was observed. No activity observed does not establish that the item is unused.',
    capture_coverage:
        'Limit of the activity evidence: retained events do not prove continuous historical capture.',
    dependency_coverage:
        'Limit of dependency evidence: current dashboard tiles and enabled schedules, not every downstream dependency.',
    requested_at: 'Time the captured human prompt was created.',
    responded_at:
        'Time of the latest observed outcome, clarification wait or interruption. Empty while pending or awaiting a retry outcome.',
    request_latency_ms:
        'Milliseconds from prompt creation to the latest observed response state, including retries. Empty for pending requests.',
    retry_count: 'Number of captured retry starts for this prompt.',
    retry_overhead_ms:
        'Milliseconds spent on failed attempts that were followed by a captured retry. Excludes the waiting time between attempts.',
    feedback_score:
        'Latest feedback for this prompt: 1 for positive or -1 for negative. Empty when no current rating exists, including removed ratings.',
    feedback_updates:
        'Number of captured feedback changes for this prompt, including rating removal.',
    ai_call_count:
        'Number of captured AI model calls linked to this prompt. One prompt can generate multiple calls.',
    known_token_call_count:
        'Number of linked AI model calls with a reported total-token count. Compare with AI call count to assess usage coverage.',
    field_id:
        'Identifier of a directly referenced semantic field at query time.',
    field_name:
        'Technical name of the directly referenced semantic field at query time.',
    field_label:
        'Display label of the directly referenced semantic field at query time.',
    table_name: 'Name of the semantic table that owns the referenced field.',
    field_kind:
        'Kind of referenced semantic field, such as a dimension or metric.',
    field_origin:
        'Where the field definition came from, such as a saved model or a query-specific field.',
    role: 'How the field was used by the query, such as a selection, filter or sort. The same field can have several roles.',
    field_identity:
        'Field identity scoped to project, table, identifier and origin, used for distinct field counts.',
    slug: 'Readable content identifier from the latest snapshot. Slugs are scoped to project and content type and can change over time.',
    chart_kind:
        'Chart category in the latest snapshot, distinguishing saved semantic charts from SQL charts.',
};

const modelDimensions: Record<string, Record<string, string>> = {
    query_events: {
        status: 'Recorded query outcome, such as success or error. Queries failing before the captured execution path are absent.',
        event_name:
            'The captured query.completed event, emitted when a query reaches a recorded outcome. Includes cache hits and execution errors.',
    },
    ai_usage: {
        outcome:
            'Whether the work associated with the model call completed or failed. Failed work can still consume tokens. Missing historical outcomes are unknown.',
        event_name:
            'The ai.usage event represents an AI model call. Use Feature and Channel to distinguish its purpose; it is not necessarily an Ask AI question.',
    },
    agent_request_events: {
        outcome:
            'Request outcome recorded by an outcome event. Other lifecycle stages may leave it empty; use Agent requests for the latest request status.',
    },
    agent_requests: {
        status: 'Latest observed request state: success, error, clarification, cancelled or pending. Pending includes requests with no captured outcome and retries awaiting an outcome.',
        surface:
            'Where the prompt was created. Filter to web_app to analyze in-app Ask AI requests separately from other surfaces.',
        total_tokens:
            'Sum of reported token totals from captured model calls linked to this prompt. Missing usage is not inferred and tokens are not monetary cost.',
    },
    tool_activity: {
        status: 'Observed success, error or unknown tool outcome. Unknown historical outcomes are excluded from the error-rate denominator.',
    },
    data_app_events: {
        view_context:
            'Surface recorded for an app HTML load: standalone, dashboard, chart, builder, embed or delivery. Missing historical context is unknown; this does not identify whether the viewer was an app builder.',
        user_id:
            'Recorded actor identifier. On embedded loads this can identify the token issuer rather than the viewer; use Data app reach for viewer counts that exclude known embeds.',
    },
    data_app_reach: {
        user_id:
            'Recorded viewer identifier. Known embed loads are left unattributed because the token issuer is not the viewer. Historical unknown context cannot distinguish embeds.',
    },
    content_reach: {
        content_name:
            'Content name captured at the time of the fetch; later renames can appear as separate groups.',
        project_name: 'Project name captured at the time of the content fetch.',
        space_name: 'Space name captured at the time of the content fetch.',
        is_verified:
            'Verification state captured at the time of the fetch. Older or unsupported states remain unknown.',
        view_context:
            'Captured fetch context: backend, preview or embed. Legacy unclassified context is unknown and does not qualify for audience counts.',
    },
    content_health: {
        content_name:
            'Content name in the latest inventory snapshot, not its name at the time of each historical event.',
        project_name: 'Project name in the latest inventory snapshot.',
        is_verified:
            'Verification state in the latest inventory snapshot, not its historical state during activity.',
        warehouse_execution_time_ms:
            'Sum of reported warehouse execution time attributed to this item across retained history, in milliseconds. Chart and dashboard attribution can overlap; not monetary cost.',
    },
    semantic_usage: {
        status: 'Recorded query outcome. One query can appear in several field and role rows; use Total queries for distinct attempts.',
    },
    lightdash_users: {
        name: 'User name from the latest available snapshot. Unknown user means no matching name is available; inspect User UUID to distinguish an identified actor from an event without a user identifier.',
    },
    lightdash_agents: {
        name: 'AI agent name from the latest available snapshot. Unknown agent means no matching name is available.',
    },
    lightdash_charts: {
        name: 'Chart name from the latest available snapshot. Historical activity uses this snapshot name, which can differ from the name at event time.',
    },
    lightdash_dashboards: {
        name: 'Dashboard name from the latest available snapshot. Historical activity uses this snapshot name, which can differ from the name at event time.',
    },
    lightdash_apps: {
        name: 'App name from the latest inventory. Falls back to the recorded app identifier, then Unknown app, when no name is available.',
        project_name: 'Project name from the latest app inventory snapshot.',
    },
};

/** Date variants and flattened joined fields inherit the same definitions. */
export const describeAnalyticsDimensions = (
    tableName: string,
    dimensions: Record<string, Dimension>,
): void => {
    for (const dimension of Object.values(dimensions)) {
        const reference =
            dimension.timeIntervalBaseDimensionName ?? dimension.name;
        dimension.description ??=
            dimensions[reference]?.description ??
            modelDimensions[tableName]?.[reference] ??
            sharedDimensions[reference];
    }
};
