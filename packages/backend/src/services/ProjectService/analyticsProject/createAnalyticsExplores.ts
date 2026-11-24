import {
    buildDimensionsFromColumns,
    CustomFormatType,
    DimensionType,
    ExploreCompiler,
    FieldType,
    friendlyName,
    JoinRelationship,
    MetricType,
    TimeFrames,
    WarehouseTypes,
    type Explore,
    type Metric,
    type UncompiledExplore,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { agentEvaluationRunColumns } from '../../../analytics/eventStream/agentEvaluationRuns';
import { contentInventoryColumns } from '../../../analytics/eventStream/contentInventory';
import { peopleMembershipColumns } from '../../../analytics/eventStream/peopleMembership';
import { compactedStreamSchemas } from '../../../analytics/eventStream/registry';
import type { CompactedColumnType } from '../../../analytics/eventStream/types';
import {
    usageDimensionSchemas,
    usageDimensionTable,
} from '../../../analytics/eventStream/usageDimensions';
import { historicalActivityColumns } from '../../../analytics/eventStream/usageHistorySources';
import {
    analyticsStreams,
    userActivityColumns,
} from '../../../analytics/eventStream/userActivity';
import {
    agentRequestsColumns,
    agentRequestsMetrics,
    agentRequestsSql,
    agentRequestStartsColumns,
    agentRequestStartsMetrics,
    agentRequestStartsSql,
} from '../../../analytics/systemExplores/agentRequests';
import {
    modelDisplayNameSql,
    modelProviders,
    modelTierRankSql,
} from '../../../analytics/systemExplores/analyticsColorPalette';
import {
    contentHealthColumns,
    contentHealthMetrics,
    contentHealthSql,
} from '../../../analytics/systemExplores/contentHealth';
import {
    analyticsProjectType,
    contentCreatedByDaySql,
    contentInventoryMetrics,
    customerContentSql,
} from '../../../analytics/systemExplores/contentInventory';
import {
    contentReachColumns,
    contentReachMetrics,
    contentReachSql,
} from '../../../analytics/systemExplores/contentReach';
import {
    dataAppOutcomesColumns,
    dataAppOutcomesMetrics,
    dataAppOutcomesSql,
} from '../../../analytics/systemExplores/dataAppOutcomes';
import {
    dataAppReachColumns,
    dataAppReachMetrics,
    dataAppReachSql,
} from '../../../analytics/systemExplores/dataAppReach';
import {
    analyticsTableDescriptions,
    describeAnalyticsDimensions,
} from '../../../analytics/systemExplores/descriptions';
import {
    embedReachColumns,
    embedReachMetrics,
    embedReachSql,
} from '../../../analytics/systemExplores/embedReach';
import {
    embedViewExploreColumns,
    embedViewExploreMetrics,
    embedViewExploreSql,
} from '../../../analytics/systemExplores/embedViewEvents';
import {
    currentPeopleSql,
    peopleAdoptionColumns,
    peopleAdoptionMetrics,
    peopleAdoptionSql,
    totalMembersMetric,
} from '../../../analytics/systemExplores/peopleAdoption';
import {
    aiChannelNames,
    aiFeatureNames,
    aiKeyNames,
    aiOutcomeNames,
    dataAppSurfaceNames,
    plainNameSql,
    type PlainNames,
} from '../../../analytics/systemExplores/plainNames';
import { queryContextNameSql } from '../../../analytics/systemExplores/queryContextNames';
import {
    semanticUsageColumns,
    semanticUsageMetrics,
    semanticUsageSql,
} from '../../../analytics/systemExplores/semanticUsage';
import {
    systemStreamMetrics,
    userActivityMetrics,
} from '../../../analytics/systemExplores/systemStreamMetrics';
import {
    toolActivityColumns,
    toolActivityMetrics,
    toolActivitySql,
} from '../../../analytics/systemExplores/toolActivity';

const dimensionFields = {
    charts: { key: 'chart_id', label: 'Chart name' },
    dashboards: { key: 'dashboard_id', label: 'Dashboard name' },
    users: { key: 'user_id', label: 'User name' },
    agents: { key: 'agent_id', label: 'Agent name' },
    projects: { key: 'project_id', label: 'Project name' },
};

// Shown in a plain-name field when nothing was recorded
const notRecorded = 'Not recorded';
// The field that says what kind of actor ran a query, where the activity records it
const actorTypeColumn: Record<string, string> = {
    query_events: 'initiating_actor_type',
    semantic_usage: 'initiating_actor_type',
};
// What marks activity as coming from an embedded viewer, where the activity records it
const embedEvidence: Record<
    string,
    (ref: (column: string) => string) => string
> = {
    query_events: (ref) =>
        `(${ref('external_user_id')} IS NOT NULL OR ${ref('embed_token_fingerprint')} IS NOT NULL OR ${ref('context')} = 'embed')`,
    semantic_usage: (ref) => `${ref('context')} = 'embed'`,
    export_events: (ref) =>
        `(${ref('external_user_id')} IS NOT NULL OR ${ref('embed_token_fingerprint')} IS NOT NULL)`,
    ai_usage: (ref) =>
        `(${ref('external_user_id')} IS NOT NULL OR ${ref('channel')} = 'embed')`,
    content_reach: (ref) => `${ref('view_context')} = 'embed'`,
    data_app_events: (ref) => `${ref('view_context')} = 'embed'`,
    data_app_reach: (ref) => `${ref('view_context')} = 'embed'`,
    data_app_outcomes: (ref) => `${ref('view_context')} = 'embed'`,
};
// Plain labels, by field name, for every explore
const intervalLabels: Partial<Record<TimeFrames, string>> = {
    [TimeFrames.DAY]: 'Day',
    [TimeFrames.WEEK]: 'Week',
    [TimeFrames.MONTH]: 'Month',
};
const dimensionLabels: Record<string, string> = {
    user_name: 'Person',
    project_name: 'Project',
    content_name: 'Content',
    retry_count: 'Retries',
    observed_viewers: 'Viewers',
    identity_coverage: 'Viewer ID',
    agent_name: 'Agent',
    app_name: 'Data app',
    dashboard_name: 'Dashboard',
    chart_name: 'Chart',
    tool_name: 'Tool',
    field_label: 'Field',
    view_context: 'Surface',
    evaluation_name: 'Evaluation',
};
// Plain labels for measures with the same name in several explores
const sharedMetricLabels: Record<string, string> = {
    unique_users: 'People',
    unique_viewers: 'Viewers',
    distinct_viewers: 'Viewers',
    unique_dashboards: 'Dashboards',
    unique_charts: 'Charts',
    unique_apps: 'Data apps',
    total_input_tokens: 'Input tokens',
    total_output_tokens: 'Output tokens',
    total_cache_read_tokens: 'Cache read tokens',
    total_cache_write_tokens: 'Cache write tokens',
    total_reasoning_tokens: 'Reasoning tokens',
    total_csv_downloads: 'CSV downloads',
    total_observed_queries: 'Queries',
    total_warehouse_execution_time_s: 'Warehouse time (seconds)',
};
// Plain labels for measures, by base table
const metricLabels: Record<string, Record<string, string>> = {
    ai_usage: { total_tokens_used: 'Tokens', total_ai_calls: 'AI calls' },
    user_activity: {
        total_events: 'Recorded activities',
        total_queries: 'Queries',
        total_ai_calls: 'AI calls',
        total_downloads: 'Downloads',
    },
    data_app_reach: { total_loads: 'Loads' },
    data_app_events: {
        unique_apps: 'Data apps',
        total_events: 'Events',
        total_views: 'Loads',
    },
    data_app_outcomes: {
        html_error: 'Page delivery failures',
        runtime_error: 'Runtime errors',
    },
    embed_reach: { total_loads: 'Loads' },
    content_health: {
        total_content: 'Content',
        total_observed_views: 'Views',
        total_enabled_schedules: 'Schedules switched on',
        total_dashboard_references: 'Dashboards using it',
    },
    content_reach: { qualifying_views: 'Views' },
    agent_requests: { distinct_requesters: 'People asking' },
    agent_evaluation_runs: { total_runs: 'Runs' },
    tool_activity: { total_calls: 'Tool calls' },
    export_events: { total_downloads: 'Downloads' },
    semantic_usage: { total_queries: 'Queries' },
    people_adoption: {
        people_without_observed_activity: 'People who have not used Lightdash',
    },
};
// What a plain-name field is called, by the column it is made from
const plainNameLabels: Record<string, string> = {
    feature: 'Feature',
    channel: 'Channel',
    view_context: 'Surface',
    key_management: 'AI key',
    outcome: 'Outcome',
    content_type: 'Content type',
    format: 'Format',
    run_status: 'Status',
    status: 'Outcome',
    cache_hit: 'Cache',
    event_name: 'Activity',
    activity_status: 'Activity status',
    organization_role: 'Organization role',
    workload_origin: 'Origin',
    initiating_actor_type: 'Started by',
    execution_source: 'Run or served by',
    field_kind: 'Kind',
    field_origin: 'Defined in',
    is_deleted: 'Deleted',
    owner_status: 'Owner status',
};
const contentTypeNames = {
    saved_chart: 'Chart',
    chart: 'Chart',
    sql_chart: 'SQL chart',
    dashboard: 'Dashboard',
    data_app: 'Data app',
    chart_type: 'Custom chart type',
};

const dimensionTypes: Record<CompactedColumnType, DimensionType> = {
    VARCHAR: DimensionType.STRING,
    TIMESTAMP: DimensionType.TIMESTAMP,
    BOOLEAN: DimensionType.BOOLEAN,
    INTEGER: DimensionType.NUMBER,
    BIGINT: DimensionType.NUMBER,
};

export const analyticsExploreNames = [
    ...analyticsStreams.filter(
        (name) => name !== 'mcp_tool_calls' && name !== 'content_views',
    ),
    'user_activity',
    'historical_activity',
    'tool_activity',
    'content_reach',
    'content_health',
    'content_inventory',
    'content_created',
    'agent_requests',
    'agent_request_starts',
    'agent_request_events',
    'agent_evaluation_runs',
    'semantic_usage',
    'data_app_reach',
    'data_app_outcomes',
    'people_adoption',
    'people_membership',
    'embed_reach',
    'embed_view_events',
] as const;

// Keep managed chart field IDs and existing filter targets stable.
const getBaseTableName = (name: (typeof analyticsExploreNames)[number]) =>
    name === 'content_inventory' || name === 'content_created'
        ? 'content_health'
        : name;

/** Compile backend-owned system models without querying remote storage. */
export const createAnalyticsExplores = (): Explore[] => {
    const sqlBuilder = warehouseSqlBuilderFromType(WarehouseTypes.DUCKDB);
    const compiler = new ExploreCompiler(sqlBuilder);
    const buildTable = (
        name: Exclude<
            (typeof analyticsExploreNames)[number],
            'agent_request_starts'
        >,
        startsOnly = false,
    ) => {
        const label = friendlyName(name);
        const tableName = getBaseTableName(name);
        const base = {
            table: tableName,
            tableLabel: label,
            fieldType: FieldType.METRIC as const,
            hidden: false,
        };
        const model = {
            embed_reach: {
                columns: embedReachColumns,
                metrics: embedReachMetrics,
            },
            embed_view_events: {
                columns: embedViewExploreColumns,
                metrics: embedViewExploreMetrics,
            },
            historical_activity: {
                columns: historicalActivityColumns,
                metrics: [
                    {
                        name: 'record_count',
                        type: MetricType.COUNT,
                        column: 'record_id',
                        description:
                            'Retained database records. Filter by activity type; these are not additional captured views or requests.',
                    },
                    {
                        name: 'distinct_people',
                        type: MetricType.COUNT_DISTINCT,
                        column: 'user_id',
                        description:
                            'Distinct identified people in the selected historical records; null actors are excluded.',
                    },
                ],
            },
            data_app_outcomes: {
                columns: dataAppOutcomesColumns,
                metrics: dataAppOutcomesMetrics,
            },
            data_app_reach: {
                columns: dataAppReachColumns,
                metrics: dataAppReachMetrics,
            },
            semantic_usage: {
                columns: semanticUsageColumns,
                metrics: semanticUsageMetrics,
            },
            people_adoption: {
                columns: peopleAdoptionColumns,
                metrics: peopleAdoptionMetrics,
            },
            people_membership: {
                columns: peopleMembershipColumns.filter(({ name: column }) =>
                    [
                        'user_id',
                        'is_active',
                        'group_ids',
                        'group_names',
                        'organization_role',
                    ].includes(column),
                ),
                metrics: [totalMembersMetric],
            },
            content_health: {
                columns: contentHealthColumns,
                metrics: contentHealthMetrics,
            },
            content_inventory: {
                columns: contentInventoryColumns,
                metrics: contentInventoryMetrics,
            },
            content_created: {
                columns: contentInventoryColumns,
                metrics: contentInventoryMetrics,
            },
            content_reach: {
                columns: contentReachColumns,
                metrics: contentReachMetrics,
            },
            user_activity: {
                columns: userActivityColumns,
                metrics: userActivityMetrics,
            },
            tool_activity: {
                columns: toolActivityColumns,
                metrics: toolActivityMetrics,
            },
            agent_requests: {
                columns: startsOnly
                    ? agentRequestStartsColumns
                    : agentRequestsColumns,
                metrics: startsOnly
                    ? agentRequestStartsMetrics
                    : agentRequestsMetrics,
            },
            agent_evaluation_runs: {
                columns: agentEvaluationRunColumns,
                metrics: [
                    {
                        name: 'total_runs',
                        type: MetricType.COUNT,
                        column: 'run_id',
                        description: 'Completed and failed evaluation runs.',
                    },
                    {
                        name: 'passed_assessments',
                        type: MetricType.SUM,
                        column: 'passed_count',
                        description:
                            'Passing assessments; human and AI assessments count separately.',
                    },
                    {
                        name: 'failed_assessments',
                        type: MetricType.SUM,
                        column: 'failed_count',
                        description:
                            'Failing assessments; human and AI assessments count separately.',
                    },
                    {
                        name: 'unassessed_results',
                        type: MetricType.SUM,
                        column: 'unassessed_count',
                        description:
                            'Completed prompt results without an assessment.',
                    },
                    {
                        name: 'execution_errors',
                        type: MetricType.SUM,
                        column: 'execution_error_count',
                        description:
                            'Prompt results that failed to execute, not failed assessments.',
                    },
                ],
            },
            agent_request_events: {
                columns: compactedStreamSchemas.agent_request_events,
                metrics: [
                    {
                        name: 'unique_lifecycle_events',
                        description:
                            'Distinct captured request lifecycle facts; includes starts, outcomes, retries, clarification waits, interruptions and feedback updates',
                        type: MetricType.COUNT_DISTINCT,
                        column: 'event_id',
                    },
                ],
            },
        };
        const modelDefinition =
            name === 'embed_reach' ||
            name === 'embed_view_events' ||
            name === 'historical_activity' ||
            name === 'semantic_usage' ||
            name === 'user_activity' ||
            name === 'tool_activity' ||
            name === 'content_reach' ||
            name === 'content_health' ||
            name === 'content_inventory' ||
            name === 'content_created' ||
            name === 'agent_requests' ||
            name === 'agent_request_events' ||
            name === 'agent_evaluation_runs' ||
            name === 'data_app_reach' ||
            name === 'data_app_outcomes' ||
            name === 'people_adoption' ||
            name === 'people_membership'
                ? model[name]
                : {
                      columns: compactedStreamSchemas[name],
                      metrics: systemStreamMetrics[name],
                  };
        const metrics: Record<string, Metric> = Object.fromEntries(
            modelDefinition.metrics.map(({ column, ...definition }) => [
                definition.name,
                {
                    ...base,
                    ...definition,
                    label: friendlyName(definition.name),
                    sql: `\${${column}}`,
                },
            ]),
        );

        // Every duration is recorded in milliseconds. Dashboards show seconds, so each such measure has a
        // twin in seconds with one decimal.
        for (const { column, ...definition } of modelDefinition.metrics) {
            if (definition.name.endsWith('_ms')) {
                const secondsName = `${definition.name.slice(0, -3)}_s`;
                metrics[secondsName] = {
                    ...base,
                    ...definition,
                    name: secondsName,
                    // "P95", not "P 95"
                    label: `${friendlyName(definition.name.slice(0, -3)).replace(/^P (\d+)/, 'P$1')} (seconds)`,
                    description: `${definition.description} Shown in seconds.`,
                    sql: `\${${column}} / 1000.0`,
                    formatOptions: { type: CustomFormatType.NUMBER, round: 1 },
                };
            }
        }
        if (name === 'tool_activity') {
            metrics.error_rate = {
                ...base,
                name: 'error_rate',
                label: 'Error rate',
                description:
                    'Failed calls divided by calls with a known success/error outcome; unknown outcomes are excluded',
                type: MetricType.NUMBER,
                sql: "1.0 * SUM(CASE WHEN ${status} = 'error' THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN ${status} IN ('success', 'error') THEN 1 ELSE 0 END), 0)",
            };
        }
        if (name === 'people_adoption') {
            for (const window of ['1d', '7d', '30d']) {
                metrics[`adoption_rate_${window}`] = {
                    ...base,
                    name: `adoption_rate_${window}`,
                    label: `Observed adoption (${window})`,
                    formatOptions: { type: CustomFormatType.PERCENT, round: 1 },
                    type: MetricType.NUMBER,
                    description: `Currently eligible members with confirmed activity in the last ${window} closed UTC days divided by all currently eligible members. Apply role/group filters consistently. Not historical or business-user eligibility.`,
                    sql: `1.0 * COUNT(DISTINCT CASE WHEN \${is_eligible} AND \${active_${window}} THEN \${user_id} END) / NULLIF(COUNT(DISTINCT CASE WHEN \${is_eligible} THEN \${user_id} END), 0)`,
                };
            }
            metrics.agent_share_30d = {
                ...base,
                name: 'agent_share_30d',
                label: 'Agent share of active people (30d)',
                formatOptions: { type: CustomFormatType.PERCENT, round: 1 },
                type: MetricType.NUMBER,
                description:
                    'Currently eligible agent requesters divided by currently eligible confirmed active people in the same 30 closed UTC days.',
                sql: '1.0 * COUNT(DISTINCT CASE WHEN ${is_eligible} AND ${agent_active_30d} THEN ${user_id} END) / NULLIF(COUNT(DISTINCT CASE WHEN ${is_eligible} AND ${active_30d} THEN ${user_id} END), 0)',
            };
        }
        if (name === 'content_reach') {
            // New content is dated from the inventory, like every other content tile. The date a view
            // event carries can differ from it. Using these measures joins the inventory.
            const firstWeekEnds =
                "date_trunc('day', ${created_at}) + INTERVAL 7 DAY";
            metrics.new_content_first_week_viewers = {
                ...base,
                name: 'new_content_first_week_viewers',
                label: 'Viewers in first week',
                description:
                    'Distinct people with a qualifying view in the first seven UTC calendar days from the creation date in the content inventory. Zero when the content was created before views were recorded.',
                type: MetricType.COUNT_DISTINCT,
                sql: `CASE WHEN \${qualifying_view_at} < ${firstWeekEnds} THEN \${user_id} END`,
            };
            metrics.new_content_returning_viewers = {
                ...base,
                name: 'new_content_returning_viewers',
                label: 'Came back later',
                description:
                    'Distinct people first seen in the first seven UTC calendar days from the creation date in the content inventory who viewed the content again on the eighth day or later.',
                type: MetricType.COUNT_DISTINCT,
                sql: `CASE WHEN \${qualifying_view_at} >= ${firstWeekEnds} AND \${first_view_day} < ${firstWeekEnds} THEN \${user_id} END`,
            };
            metrics.verified_audience_share = {
                ...base,
                name: 'verified_audience_share',
                label: 'Verified audience share',
                description:
                    'Distinct viewers of verified content divided by distinct viewers with known verification state in the selected period. A viewer of both counts once; SQL charts and legacy unknown states are excluded from the denominator.',
                type: MetricType.NUMBER,
                sql: '1.0 * COUNT(DISTINCT ${verified_viewer_id}) / NULLIF(COUNT(DISTINCT ${known_verification_viewer_id}), 0)',
            };
        }
        if (name === 'agent_requests' && !startsOnly) {
            const ratio = (
                metricName: string,
                condition: string,
                description: string,
            ): Metric => ({
                ...base,
                name: metricName,
                label: friendlyName(metricName),
                description,
                type: MetricType.NUMBER,
                sql: `1.0 * SUM(CASE WHEN ${condition} THEN 1 ELSE 0 END) / NULLIF(COUNT(\${prompt_id}), 0)`,
            });
            metrics.completion_rate = ratio(
                'completion_rate',
                "${status} = 'success'",
                'Successful requests divided by all captured requests, including pending requests',
            );
            metrics.failure_rate = ratio(
                'failure_rate',
                "${status} = 'error'",
                'Failed requests divided by all captured requests, including pending requests',
            );
            metrics.response_coverage = ratio(
                'response_coverage',
                "${status} IN ('success', 'error', 'clarification', 'cancelled')",
                'Requests with an observed outcome or explicit wait/cancellation divided by all captured requests',
            );
            metrics.feedback_coverage = ratio(
                'feedback_coverage',
                '${feedback_score} IS NOT NULL',
                'Requests with a current rating divided by all captured requests; removed ratings are excluded',
            );
            metrics.negative_feedback_rate = {
                ...base,
                name: 'negative_feedback_rate',
                label: 'Negative feedback rate',
                description:
                    'Negative ratings divided by requests with a current rating; unrated requests are excluded',
                type: MetricType.NUMBER,
                sql: '1.0 * SUM(CASE WHEN ${feedback_score} = -1 THEN 1 ELSE 0 END) / NULLIF(COUNT(${feedback_score}), 0)',
            };
        }
        if (name === 'agent_evaluation_runs') {
            metrics.pass_rate = {
                ...base,
                name: 'pass_rate',
                label: 'Assessment pass rate',
                description:
                    'Passing assessments divided by all assessments. Runs without assessments have no rate.',
                type: MetricType.NUMBER,
                formatOptions: { type: CustomFormatType.PERCENT, round: 1 },
                sql: '1.0 * SUM(${passed_count}) / NULLIF(SUM(${passed_count} + ${failed_count}), 0)',
            };
        }
        const table = {
            name: tableName,
            label,
            ...(name === 'query_events'
                ? { primaryKey: ['org_id', 'query_id'] }
                : {}),
            sqlTable: startsOnly
                ? agentRequestStartsSql
                : ((
                      {
                          embed_reach: embedReachSql,
                          embed_view_events: embedViewExploreSql,
                          tool_activity: toolActivitySql,
                          content_reach: contentReachSql,
                          content_health: contentHealthSql,
                          content_inventory: customerContentSql,
                          content_created: contentCreatedByDaySql,
                          agent_requests: agentRequestsSql,
                          agent_evaluation_runs: `"${usageDimensionTable('agent_evaluation_runs')}"`,
                          semantic_usage: semanticUsageSql,
                          data_app_reach: dataAppReachSql,
                          data_app_outcomes: dataAppOutcomesSql,
                          people_adoption: peopleAdoptionSql,
                          people_membership: currentPeopleSql,
                      } as Partial<Record<typeof name, string>>
                  )[name] ?? `"${name}"`),

            database: 'memory',
            schema: 'main',
            lineageGraph: { nodes: [], edges: [] },
            dimensions: buildDimensionsFromColumns({
                qualifyColumnReferences: true,
                tableName,
                tableLabel: label,
                columns: modelDefinition.columns.map(
                    ({ name: reference, type }) => ({
                        reference,
                        type: dimensionTypes[type],
                    }),
                ),
                warehouseSqlBuilder: sqlBuilder,
            }),
            metrics,
        };
        // A second field beside one whose values are code names, showing them in plain words
        const addPlainName = (column: string, names: PlainNames = {}) => {
            const recorded = table.dimensions[column];
            // Not every model that shares a table has the column
            if (!recorded) return;
            table.dimensions[`${column}_name`] = {
                ...recorded,
                name: `${column}_name`,
                label: plainNameLabels[column],
                type: DimensionType.STRING,
                description: `${recorded.label} in plain words. Filter on ${recorded.label} (recorded value).`,
                sql: plainNameSql(recorded.sql, names),
            };
            // Two fields cannot share a name in the field list
            recorded.label = `${recorded.label} (recorded value)`;
        };
        if (name === 'ai_usage') {
            addPlainName('feature', aiFeatureNames);
            addPlainName('channel', aiChannelNames);
            addPlainName('key_management', aiKeyNames);
            addPlainName('outcome', aiOutcomeNames);
            // The provider read from the model's name, with the same prefixes that colour the model
            // charts, so a Claude model reached through Bedrock still counts as Anthropic
            table.dimensions.model_provider = {
                ...table.dimensions.model,
                name: 'model_provider',
                label: 'Model provider',
                description:
                    'Provider worked out from the start of the model name: Anthropic, OpenAI, Google, or Other when the name matches none. Provider holds the recorded route, such as bedrock.',
                sql: `CASE ${modelProviders
                    .map(
                        ({ label: provider, prefixes }) =>
                            `WHEN ${prefixes
                                .map(
                                    (prefix) =>
                                        `starts_with(lower(${table.dimensions.model.sql}), '${prefix}')`,
                                )
                                .join(' OR ')} THEN '${provider}'`,
                    )
                    .join(
                        ' ',
                    )} WHEN ${table.dimensions.model.sql} IS NULL THEN NULL ELSE 'Other' END`,
            };
        }
        if (name === 'ai_usage') {
            // The name a reader sees, without a trailing date stamp. Charts group by it.
            table.dimensions.model_name = {
                ...table.dimensions.model,
                name: 'model_name',
                label: 'Model',
                description:
                    'Model name without the date stamp some providers add, so claude-haiku-4-5-20251001 reads claude-haiku-4-5. Filter on Model (recorded name).',
                sql: modelDisplayNameSql(table.dimensions.model.sql),
            };
            table.dimensions.model.label = 'Model (recorded name)';
            table.dimensions.model_tier = {
                ...table.dimensions.model,
                name: 'model_tier',
                label: 'Model tier',
                type: DimensionType.NUMBER,
                description:
                    "Place of the model among its provider's tiers: 0 is the most powerful, such as Opus or Ultra. A model with no known tier comes last.",
                sql: modelTierRankSql(
                    table.dimensions.model.sql,
                    table.dimensions.model_provider.sql,
                ),
            };
        }
        if (name === 'query_events') {
            addPlainName('workload_origin', {
                names: { app: 'Data app', mcp: 'MCP' },
                missing: notRecorded,
            });
            addPlainName('initiating_actor_type', {
                names: { registered_user: 'Signed-in person' },
                missing: notRecorded,
            });
            addPlainName('cache_hit', {
                names: { true: 'Cache hit', false: 'Cache miss' },
                missing: notRecorded,
            });
            addPlainName('execution_source', {
                names: {
                    warehouse: 'Warehouse',
                    pre_aggregate_duckdb: 'Pre-aggregate (DuckDB)',
                    pre_aggregate_warehouse: 'Pre-aggregate (warehouse)',
                    external_source_duckdb: 'External source (DuckDB)',
                    composer_duckdb: 'Composer (DuckDB)',
                    live_source: 'Live source',
                },
                missing: notRecorded,
            });
            // A cache hit never reaches an executor, so it is recorded with no source: the results
            // cache served it
            table.dimensions.execution_source_name.sql = `CASE WHEN ${table.dimensions.execution_source.sql} IS NULL AND ${table.dimensions.cache_hit.sql} THEN 'Results cache' ELSE ${table.dimensions.execution_source_name.sql} END`;
            addPlainName('status', { missing: notRecorded });
        }
        if (
            name === 'content_health' ||
            name === 'content_inventory' ||
            name === 'content_created' ||
            name === 'content_reach'
        ) {
            addPlainName('content_type', { names: contentTypeNames });
            // Only dashboards have an owner. "Not recorded" is every other type of content, which has no
            // owner to record, not an owner that went missing.
            addPlainName('owner_status', {
                names: {
                    'Active organization member': 'Active member',
                    Deactivated: 'Deactivated',
                    'Not an organization member': 'Not a member',
                    Unassigned: 'No owner',
                    'Unknown user': 'Unknown owner',
                    'Not recorded': 'Has no owner (chart or data app)',
                },
            });
            addPlainName('is_deleted', {
                names: { true: 'Deleted', false: 'Not deleted' },
            });
            addPlainName('activity_status', {
                names: {
                    'Activity observed': 'Has recorded activity',
                    'No activity observed; known dependency':
                        'No recorded activity, still in use',
                    'No activity observed; coverage incomplete':
                        'No recorded activity',
                },
            });
        }
        addPlainName('view_context', dataAppSurfaceNames);
        if (name === 'data_app_events')
            addPlainName('event_name', {
                names: {
                    'data_app.created': 'Created',
                    'data_app.iterated': 'Iterated',
                    'data_app.view': 'Loaded',
                    'data_app.view_outcome': 'Load result signal',
                    'data_app.deleted': 'Deleted',
                    'data_app.downloaded': 'Downloaded',
                    'data_app.duplicated': 'Duplicated',
                    'data_app.file_uploaded': 'File uploaded',
                    'data_app.promoted': 'Promoted',
                    'data_app.registry_installed': 'Installed from the library',
                    'data_app.upgrade_requested': 'Upgrade requested',
                    'data_app.upload_rejected': 'Upload rejected',
                    'data_app.uploaded': 'Uploaded',
                },
            });
        if (name === 'export_events')
            addPlainName('format', {
                names: {
                    csv: 'CSV',
                    xlsx: 'Excel',
                    pdf: 'PDF',
                    gsheets: 'Google Sheets',
                },
                missing: notRecorded,
            });
        if (name === 'agent_evaluation_runs') addPlainName('run_status');
        if (name === 'people_adoption') {
            addPlainName('organization_role');
            addPlainName('activity_status', {
                names: {
                    'Not currently eligible': 'Not currently eligible',
                    'Active in last 7 closed days': 'Active in the last 7 days',
                    'Active in last 30 closed days':
                        'Active in the last 30 days',
                    'Previously observed; inactive for 30 days':
                        'Used Lightdash before, not in the last 30 days',
                    'No qualifying activity observed': 'No recorded use',
                },
            });
        }
        if (name === 'semantic_usage') {
            addPlainName('field_kind');
            addPlainName('field_origin');
        }
        // Views and queries of Lightdash's own analytics dashboards are real activity, so they stay in
        // counts of people and queries. A tile that lists the customer's content filters them out.
        if (
            (name === 'content_reach' || name === 'query_events') &&
            table.dimensions.project_id
        )
            table.dimensions.in_analytics_project = {
                ...table.dimensions.project_id,
                name: 'in_analytics_project',
                label: 'In the Analytics project',
                type: DimensionType.BOOLEAN,
                description:
                    "Whether the activity was on Lightdash's own analytics dashboards and charts. Filter to No to list only content your organization made.",
                sql: `EXISTS (SELECT 1 FROM lightdash_content analytics_content WHERE analytics_content.project_type = '${analyticsProjectType}' AND analytics_content.org_id = ${table.dimensions.org_id.sql} AND analytics_content.project_id = ${table.dimensions.project_id.sql})`,
            };
        // A data app the organization made: in the inventory as a data app, not a custom chart type,
        // and not in the Analytics project
        if (name === 'data_app_events')
            table.dimensions.is_organization_data_app = {
                ...table.dimensions.app_id,
                name: 'is_organization_data_app',
                label: "One of the organization's data apps",
                type: DimensionType.BOOLEAN,
                description:
                    "Whether the event is for a data app your organization made. No for a custom chart type and for Lightdash's own analytics apps.",
                sql: `EXISTS (SELECT 1 FROM lightdash_content own_app WHERE own_app.content_type = 'data_app' AND (own_app.project_type IS NULL OR own_app.project_type <> '${analyticsProjectType}') AND own_app.org_id = ${table.dimensions.org_id.sql} AND own_app.content_id = ${table.dimensions.app_id.sql})`,
            };
        if (table.dimensions.user_id)
            table.dimensions.user_id.label = 'Person ID';
        if (table.dimensions.project_id)
            table.dimensions.project_id.label = 'Project ID';
        if (table.dimensions.agent_id)
            table.dimensions.agent_id.label = 'Agent ID';
        if (name === 'people_membership')
            table.dimensions.user_id.hidden = true;
        if (startsOnly) table.dimensions.org_id.hidden = true;
        if (name === 'embed_reach') {
            for (const field of [
                'org_id',
                'event_id',
                'viewer_key',
                'dashboard_key',
            ]) {
                table.dimensions[field].hidden = true;
            }
            table.dimensions.dashboard_label.label = 'Dashboard';
            table.dimensions.external_user_id.description =
                'Explicit external ID supplied by the embed issuer; not a registered user or a tenant ID. Missing IDs remain null.';
            table.dimensions.event_ts.description =
                'Time of the successful authorized dashboard fetch. Capture begins after deployment; no historical loads are reconstructed.';
        }
        if (name === 'embed_view_events') {
            const { dimensions } = table;
            dimensions.viewer_key.hidden = true;
            dimensions.tenant_key.hidden = true;
            dimensions.external_user_id.label = 'External viewer ID';
            dimensions.embed_tenant_id.label = 'Embed tenant ID';
            dimensions.embed_tenant_attribute.label = 'Embed tenant attribute';
        }
        if (name === 'query_events' || name === 'export_events') {
            const { dimensions } = table;
            dimensions.external_user_id.label = 'External viewer ID';
            dimensions.external_user_id.description =
                'Viewer ID supplied by the embed issuer. Separate from the Person ID of a signed-in person.';
            dimensions.embed_token_fingerprint.label =
                'Embed token fingerprint';
            dimensions.embed_token_fingerprint.description =
                'Identifies one signed embed token when no external viewer ID was provided. A refreshed token may have a different fingerprint.';
            dimensions.embed_tenant_attribute.label = 'Embed tenant attribute';
            dimensions.embed_tenant_attribute.description =
                'Name of the signed user attribute explicitly selected for reporting.';
            dimensions.embed_tenant_id.label = 'Embed tenant ID';
            dimensions.embed_tenant_id.description =
                'Value of the selected tenant attribute; null when the embed issuer has not opted in.';
        }
        if (name === 'query_events') {
            table.dimensions.semantic_field_references.hidden = true;
            // The same grouping as Context, under names a reader does not have to decode
            table.dimensions.context_name = {
                ...table.dimensions.context,
                name: 'context_name',
                label: 'Run from',
                description:
                    'Plain name for Context, such as Dashboard view, Explore or Scheduled delivery. A value with no plain name is shown as recorded. Filter on Context, which holds the recorded value.',
                sql: queryContextNameSql(table.dimensions.context.sql),
            };
            // Library charts title their axes with these labels
            metrics.unique_users.label = 'People';
            metrics.total_queries.label = 'Queries';
            metrics.queries_per_user = {
                ...base,
                name: 'queries_per_user',
                label: 'Queries per querying user',
                description:
                    'Recorded query attempts with an identified user divided by distinct querying users in the period. Includes service accounts.',
                type: MetricType.NUMBER,
                sql: 'ROUND(1.0 * COUNT(${query_id}) FILTER (WHERE ${user_id} IS NOT NULL) / NULLIF(COUNT(DISTINCT ${user_id}), 0), 1)',
            };
        }
        if (name === 'historical_activity') {
            table.dimensions.org_id.hidden = true;
            table.dimensions.schema_version.hidden = true;
            table.dimensions.current_status.description =
                'Status stored at the last import, not status at the historical record timestamp.';
            table.dimensions.event_ts.description =
                'Timestamp retained by the source record. No missing lifecycle timestamps are reconstructed.';
            table.dimensions.activity_type.description =
                'Meaning of the database record. Chart view records can include query executions; these counts must not be added to captured view totals.';
        }
        if (name === 'semantic_usage') {
            table.dimensions.context_name = {
                ...table.dimensions.context,
                name: 'context_name',
                label: 'Run from',
                description:
                    'Plain name for Context, such as Dashboard view, Explore or Scheduled delivery. A value with no plain name is shown as recorded. Filter on Context, which holds the recorded value.',
                sql: queryContextNameSql(table.dimensions.context.sql),
            };
            table.dimensions.has_content = {
                ...table.dimensions.chart_id,
                name: 'has_content',
                label: 'Linked to saved content',
                type: DimensionType.BOOLEAN,
                description:
                    'Whether the query came from a chart, a dashboard or a data app. A query from exploring directly, and some others, is linked to none.',
                sql: `(${table.dimensions.chart_id.sql} IS NOT NULL OR ${table.dimensions.dashboard_id.sql} IS NOT NULL OR ${table.dimensions.app_id.sql} IS NOT NULL)`,
            };
            table.dimensions.org_id.hidden = true;
            table.dimensions.field_identity.hidden = true;
            table.dimensions.definition_hash.description =
                'Hash of the captured field definition. No historical dependency graph or rename mapping is inferred.';
            table.dimensions.lineage_status.description =
                'Captured: direct field references known. Partial: some references omitted or unsupported. Unavailable: SQL-only or capture failed. Not captured: historical query without field capture.';
        }
        if (name === 'data_app_reach') {
            table.dimensions.org_id.hidden = true;
            table.dimensions.event_name.hidden = true;
            table.dimensions.view_context.description =
                'UI surface captured at token creation, not historical builder identity. Older loads have unknown context. Reloads remain included.';
        }
        if (name === 'data_app_outcomes') {
            table.dimensions.org_id.hidden = true;
            table.dimensions.event_name.hidden = true;
            table.dimensions.navigation_key.hidden = true;
            table.dimensions.navigation_id.label = 'Navigation UUID';
            table.dimensions.version.description =
                'App version authorized by the preview capability when this signal was captured.';
        }
        if (name === 'people_adoption') {
            table.dimensions.org_id.hidden = true;
            table.dimensions.project_id.hidden = true;
            table.dimensions.name.label = 'User name';
            table.dimensions.email.label = 'User email';
            table.dimensions.email.description =
                'Current primary email at the latest membership refresh, not the email at event time. Unavailable emails are NULL.';
            table.dimensions.group_ids.description =
                'JSON array of current group UUIDs. Filter by a quoted UUID to select a group without multiplying people. Groups are not inferred HR teams.';
            table.dimensions.group_names.description =
                'Current group names as a JSON array, in UUID order. Overlapping groups keep one person row.';
            table.dimensions.snapshot_at.description =
                'When current organization membership was observed. Historical snapshots are retained separately; this Explore uses the latest population.';
            table.dimensions.no_observed_activity.description =
                'No confirmed human activity in retained capture, not proof that the person has never used Lightdash.';
            table.dimensions.flow_bits.description =
                'Activity windows for the Adoption app. Add 1 for the last 28 closed UTC days, 2 for the preceding 28 days and 4 for earlier retained activity.';
            table.dimensions.parts_used.description =
                'Feature usage in the last 30 closed UTC days. The bit values are dashboards (1), charts (2), Explore and SQL Runner (4), Ask AI (8), MCP (16), app views (32), app builds (64) and downloads (128).';
            table.dimensions.last_seen.description =
                'Most recent observed or inferred activity: within 7 closed UTC days (d7), within 30 (d30), older, or never recorded in those categories.';
            table.dimensions.last_seen_bin.description =
                'Ten-day bucket for the most recent observed or inferred activity. 0 is 0–9 days ago, 9 is 90 or more, and never means neither category was recorded.';
            table.dimensions.last_seen_day.description =
                'UTC date of the most recent observed or inferred activity, in YYYY-MM-DD form.';
        }
        if (
            name === 'content_health' ||
            name === 'content_inventory' ||
            name === 'content_created'
        ) {
            table.dimensions.org_id.hidden = true;
            table.dimensions.owner_status.description =
                'Current ownership evidence. Not an organization member does not imply employment ended. Creators and editors are not inferred to be owners.';
        }
        if (name === 'content_health') {
            table.dimensions.observed_viewers.description =
                'Distinct qualifying registered viewers per item across retained history. Do not sum across items.';
            table.dimensions.first_observed_event_at.description =
                'Earliest retained event for this organization; this is not proof of complete capture since that date.';
        }
        if (name === 'content_reach') {
            metrics.distinct_viewers.label = 'Chart and dashboard viewers';
            for (const column of [
                'org_id',
                'schema_version',
                'qualifying_view_at',
                'viewer_id',
                'returning_viewer_id',
                'first_week_returning_viewer_id',
                'known_verification_viewer_id',
                'verified_viewer_id',
            ]) {
                for (const field of Object.values(table.dimensions)) {
                    if (
                        field.name === column ||
                        field.name.startsWith(`${column}_`)
                    )
                        field.hidden = true;
                }
            }
        }
        if (name === 'agent_requests') {
            metrics.total_requests.label = 'Agent requests';
        }
        if (name === 'agent_evaluation_runs') {
            for (const column of [
                'org_id',
                'passed_count',
                'failed_count',
                'unassessed_count',
                'execution_error_count',
            ]) {
                table.dimensions[column].hidden = true;
            }
        }
        if (name === 'ai_usage') {
            metrics.total_ai_calls.label = 'AI model calls';
        }
        if (name === 'user_activity') {
            metrics.unique_users.label = 'People';
            table.dimensions.org_id.hidden = true;
            for (const column of userActivityColumns.filter(
                ({ type }) => type === 'BIGINT',
            )) {
                table.dimensions[column.name].hidden = true;
            }
        }
        return table;
    };

    return analyticsExploreNames.map((exploreName) => {
        const startsOnly = exploreName === 'agent_request_starts';
        const name = startsOnly ? 'agent_requests' : exploreName;
        const dimensions: (keyof typeof dimensionFields)[] = [];
        if (
            name === 'query_events' ||
            name === 'export_events' ||
            name === 'semantic_usage'
        ) {
            dimensions.push('charts', 'dashboards', 'users');
        } else if (
            name !== 'content_health' &&
            name !== 'content_inventory' &&
            name !== 'content_created' &&
            name !== 'people_adoption' &&
            name !== 'people_membership' &&
            name !== 'embed_reach' &&
            name !== 'embed_view_events'
        ) {
            dimensions.push('users');
        }
        if (
            name === 'ai_usage' ||
            name === 'agent_steps' ||
            name === 'agent_requests' ||
            name === 'agent_request_events' ||
            name === 'tool_activity' ||
            name === 'historical_activity'
        )
            dimensions.push('agents');
        if (name === 'ai_usage' || name === 'historical_activity')
            dimensions.push('projects');
        const dimensionTables = Object.fromEntries(
            dimensions.map((dimension) => {
                const tableName = usageDimensionTable(dimension);
                const tableLabel = friendlyName(dimension);
                const fields = buildDimensionsFromColumns({
                    qualifyColumnReferences: true,
                    tableName,
                    tableLabel,
                    columns: usageDimensionSchemas[dimension].map(
                        ({ name: reference, type }) => ({
                            reference,
                            type: dimensionTypes[type],
                        }),
                    ),
                    warehouseSqlBuilder: sqlBuilder,
                });
                fields.org_id.hidden = true;
                fields.name.label = dimensionFields[dimension].label;
                // Names say who or what it was, as far as the activity records it. "Unknown" is kept for
                // an ID that matches nothing in the snapshot; having no ID at all is said plainly.
                // Downloads take their agent and project through the query they exported
                const source =
                    name === 'export_events' && dimension !== 'users'
                        ? 'query_events'
                        : name;
                const ref = (column: string) => `\${${name}.${column}}`;
                if (dimension === 'users') {
                    const noId = `NULLIF(TRIM(${ref('user_id')}), '') IS NULL`;
                    const embedded = embedEvidence[name]?.(ref);
                    const actor = actorTypeColumn[name]
                        ? ref(actorTypeColumn[name])
                        : null;
                    const nobody = embedded
                        ? `CASE WHEN ${embedded} THEN 'Embedded viewer' ELSE 'No user recorded' END`
                        : "'No user recorded'";
                    fields.name.sql = `CASE ${
                        actor
                            ? `WHEN ${actor} = 'service_account' THEN 'Service account ' || COALESCE(\${TABLE}.name, left(${ref('user_id')}, 8), '') WHEN ${actor} = 'anonymous' THEN ${
                                  embedded
                                      ? `CASE WHEN ${embedded} THEN 'Embedded viewer' ELSE 'Anonymous' END`
                                      : "'Anonymous'"
                              } `
                            : ''
                    }WHEN ${noId} THEN ${nobody} ELSE COALESCE(\${TABLE}.name, 'Unknown user') || CASE WHEN \${TABLE}.is_active = false AND \${TABLE}.name IS NOT NULL THEN ' (deactivated)' ELSE '' END END`;
                    // Read through the name; not a field of its own
                    fields.is_active.hidden = true;
                    fields.email.label = 'User email';
                    fields.email.description =
                        'Current primary email at the latest user metadata refresh, not the email at event time. Unavailable emails are NULL.';
                }
                if (dimension === 'agents')
                    fields.name.sql = `CASE WHEN \${${source}.agent_id} IS NULL THEN 'No agent' ELSE COALESCE(\${TABLE}.name, 'Unknown agent') END`;
                if (dimension === 'projects')
                    fields.name.sql = `CASE WHEN \${${source}.project_id} IS NULL THEN 'No project' ELSE COALESCE(\${TABLE}.name, 'Unknown project') END`;
                return [
                    tableName,
                    {
                        name: tableName,
                        label: tableLabel,
                        primaryKey: ['org_id', dimensionFields[dimension].key],
                        sqlTable: `"${tableName}"`,
                        database: 'memory',
                        schema: 'main',
                        lineageGraph: { nodes: [], edges: [] },
                        dimensions: fields,
                        metrics: {},
                    },
                ];
            }),
        );
        const label = friendlyName(exploreName);
        const includeContentMetadata =
            name === 'content_reach' || name === 'historical_activity';
        const contentTableName = usageDimensionTable('content');
        const contentFields = buildDimensionsFromColumns({
            qualifyColumnReferences: true,
            tableName: contentTableName,
            tableLabel: 'Content',
            columns: [
                'org_id',
                'project_id',
                'content_id',
                'content_type',
                'content_url',
                ...(name === 'historical_activity' ? ['content_name'] : []),
            ]
                .map((reference) => ({
                    reference,
                    type: DimensionType.STRING,
                }))
                // When the item was created, as the inventory records it
                .concat(
                    name === 'content_reach'
                        ? [
                              {
                                  reference: 'created_at',
                                  type: DimensionType.TIMESTAMP,
                              },
                          ]
                        : [],
                ),
            warehouseSqlBuilder: sqlBuilder,
        });
        const includeQueryMetadata = name === 'export_events';
        const appTableName = 'lightdash_apps';
        const includeAppMetadata =
            name === 'data_app_events' ||
            name === 'semantic_usage' ||
            name === 'data_app_reach' ||
            name === 'data_app_outcomes' ||
            name === 'historical_activity';
        const appFields = buildDimensionsFromColumns({
            qualifyColumnReferences: true,
            tableName: appTableName,
            tableLabel: 'Apps',
            columns: [
                'org_id',
                'project_id',
                'app_id',
                'name',
                'project_name',
            ].map((reference) => ({ reference, type: DimensionType.STRING })),
            warehouseSqlBuilder: sqlBuilder,
        });
        appFields.org_id.hidden = true;
        appFields.name.label = 'App name';
        appFields.name.sql = `COALESCE(\${TABLE}.name, \${${name}.app_id}, 'Unknown app')`;
        // A row with no data app has no data app name, not an unknown one
        if (name === 'historical_activity' || name === 'semantic_usage')
            appFields.name.sql = `CASE WHEN \${${name}.app_id} IS NULL THEN NULL ELSE ${appFields.name.sql} END`;
        const explore: UncompiledExplore = {
            name: exploreName,
            label,
            tags: [],
            baseTable: getBaseTableName(name),
            joinedTables: [
                ...(includeContentMetadata
                    ? [
                          {
                              table: contentTableName,
                              type: 'left' as const,
                              relationship: JoinRelationship.MANY_TO_ONE,
                              fields:
                                  name === 'historical_activity'
                                      ? ['content_name', 'content_url']
                                      : [
                                            'content_url',
                                            'created_at',
                                            'created_at_day',
                                        ],
                              sqlOn: `\${${name}.org_id} = \${lightdash_content.org_id} AND \${${name}.project_id} = \${lightdash_content.project_id} AND \${${name}.content_id} = \${lightdash_content.content_id} AND CASE WHEN \${${name}.content_type} = 'chart' THEN 'saved_chart' ELSE \${${name}.content_type} END = \${lightdash_content.content_type}`,
                          },
                      ]
                    : []),
                ...(includeAppMetadata
                    ? [
                          {
                              table: appTableName,
                              type: 'left' as const,
                              relationship: JoinRelationship.MANY_TO_ONE,
                              sqlOn: `\${${name}.org_id} = \${lightdash_apps.org_id} AND \${${name}.project_id} = \${lightdash_apps.project_id} AND \${${name}.app_id} = \${lightdash_apps.app_id}`,
                          },
                      ]
                    : []),
                ...(includeQueryMetadata
                    ? [
                          {
                              table: 'query_events',
                              type: 'left' as const,
                              sqlOn: '${export_events.org_id} = ${query_events.org_id} AND ${export_events.query_id} = ${query_events.query_id}',
                              relationship: JoinRelationship.MANY_TO_ONE,
                              fields: [
                                  'chart_id',
                                  'dashboard_id',
                                  'explore_name',
                              ],
                          },
                      ]
                    : []),
                ...dimensions.map((dimension) => {
                    const table = usageDimensionTable(dimension);
                    const id = dimensionFields[dimension].key;
                    const source =
                        includeQueryMetadata && dimension !== 'users'
                            ? 'query_events'
                            : name;
                    return {
                        table,
                        type: 'left' as const,
                        relationship: JoinRelationship.MANY_TO_ONE,
                        sqlOn: `\${${name}.org_id} = \${${table}.org_id} AND \${${source}.${id}} = \${${table}.${id}}`,
                    };
                }),
            ],
            meta: {},
            targetDatabase: sqlBuilder.getAdapterType(),
            tables: {
                ...(includeContentMetadata
                    ? {
                          [contentTableName]: {
                              name: contentTableName,
                              label: 'Content',
                              primaryKey: [
                                  'org_id',
                                  'project_id',
                                  'content_type',
                                  'content_id',
                              ],
                              sqlTable: `"${contentTableName}"`,
                              database: 'memory',
                              schema: 'main',
                              lineageGraph: { nodes: [], edges: [] },
                              dimensions: contentFields,
                              metrics: {},
                          },
                      }
                    : {}),
                ...(includeAppMetadata
                    ? {
                          [appTableName]: {
                              name: appTableName,
                              label: 'Apps',
                              primaryKey: ['org_id', 'project_id', 'app_id'],
                              sqlTable: `(SELECT org_id, project_id, content_id AS app_id,
                                  content_name AS name, project_name
                                  FROM lightdash_content WHERE content_type IN ('data_app', 'chart_type'))`,
                              database: 'memory',
                              schema: 'main',
                              lineageGraph: { nodes: [], edges: [] },
                              dimensions: appFields,
                              metrics: {},
                          },
                      }
                    : {}),
                ...dimensionTables,
                [getBaseTableName(name)]: buildTable(name, startsOnly),
                ...(includeQueryMetadata
                    ? { query_events: buildTable('query_events') }
                    : {}),
            },
        };

        for (const table of Object.values(explore.tables)) {
            const modelName =
                table.name === explore.baseTable ? name : table.name;
            table.description = analyticsTableDescriptions[modelName];
            describeAnalyticsDimensions(modelName, table.dimensions);
        }
        if (startsOnly) {
            explore.tables[name].description =
                'One row per captured human prompt, using the same event and creation deduplication as Agent requests. Counts questions and exact distinct requesters without preparing outcomes or model usage. Pending and failed prompts remain included.';
        }

        // Keep the joins lazy, but present their fields alongside the activity.
        const metadataPrefixes: Record<string, string> = {
            lightdash_charts: 'chart',
            lightdash_dashboards: 'dashboard',
            lightdash_users: 'user',
            lightdash_agents: 'agent',
            lightdash_projects: 'project',
            lightdash_apps: 'app',
        };
        const baseTable = explore.tables[explore.baseTable];
        for (const join of explore.joinedTables) {
            const prefix = metadataPrefixes[join.table];
            for (const dimension of Object.values(
                explore.tables[join.table].dimensions,
            ).filter(
                (field) =>
                    !field.hidden &&
                    (!join.fields || join.fields.includes(field.name)),
            )) {
                const fieldName =
                    !prefix ||
                    dimension.name.startsWith(`${prefix}_`) ||
                    dimension.name.startsWith('project_')
                        ? dimension.name
                        : `${prefix}_${dimension.name}`;
                if (!baseTable.dimensions[fieldName]) {
                    baseTable.dimensions[fieldName] = {
                        ...dimension,
                        table: name,
                        tableLabel: label,
                        name: fieldName,
                        label: friendlyName(fieldName),
                        sql: `\${${join.table}.${dimension.name}}`,
                    };
                }
            }
            join.hidden = true;
        }
        for (const contentType of ['chart', 'dashboard', 'content']) {
            const nameField = baseTable.dimensions[`${contentType}_name`];
            if (nameField && baseTable.dimensions[`${contentType}_url`]) {
                nameField.urls = [
                    {
                        label: `Open ${contentType}`,
                        url: `\${row.${baseTable.name}.${contentType}_url.raw}`,
                    },
                ];
            }
        }
        // A tool call by a service account has no user, so by person it would sit with every other
        // service account under Unknown user. This names each one. The service account's own name is
        // not in the usage data, so the first part of its ID tells them apart.
        if (name === 'tool_activity' && baseTable.dimensions.user_name) {
            const { actor_type: actorType, actor_id: actorId } =
                baseTable.dimensions;
            baseTable.dimensions.actor_name = {
                ...baseTable.dimensions.user_name,
                name: 'actor_name',
                label: 'Person or service account',
                description:
                    "The person's name, or Service account with the start of its ID for a call made by a service account.",
                sql: `CASE WHEN ${actorType.sql} = 'service_account' THEN 'Service account ' || COALESCE(left(${actorId.sql}, 8), '') ELSE ${baseTable.dimensions.user_name.sql} END`,
            };
        }
        // Library charts title their axes, legends and columns with these labels, so the fields a
        // dashboard tile can show are named the way a tile would name them.
        for (const dimension of Object.values(baseTable.dimensions)) {
            const plain =
                (dimension.timeInterval &&
                    intervalLabels[dimension.timeInterval]) ??
                dimensionLabels[dimension.name];
            if (plain) dimension.label = plain;
        }
        for (const [metric, plain] of Object.entries({
            ...sharedMetricLabels,
            ...metricLabels[explore.baseTable],
        })) {
            if (baseTable.metrics[metric])
                baseTable.metrics[metric].label = plain;
        }
        return compiler.compileExplore(explore);
    });
};
