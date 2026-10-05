import {
    buildDimensionsFromColumns,
    DimensionType,
    ExploreCompiler,
    FieldType,
    friendlyName,
    JoinRelationship,
    MetricType,
    WarehouseTypes,
    type Explore,
    type Metric,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { compactedStreamSchemas } from '../../../analytics/eventStream/registry';
import type { CompactedColumnType } from '../../../analytics/eventStream/types';
import {
    usageDimensionSchemas,
    usageDimensionTable,
    type UsageDimensionName,
} from '../../../analytics/eventStream/usageDimensions';
import {
    analyticsStreams,
    userActivityColumns,
} from '../../../analytics/eventStream/userActivity';
import {
    agentRequestsColumns,
    agentRequestsMetrics,
    agentRequestsSql,
} from '../../../analytics/systemExplores/agentRequests';
import {
    contentHealthColumns,
    contentHealthMetrics,
    contentHealthSql,
} from '../../../analytics/systemExplores/contentHealth';
import {
    contentReachColumns,
    contentReachMetrics,
    contentReachSql,
} from '../../../analytics/systemExplores/contentReach';
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
    'tool_activity',
    'content_reach',
    'content_health',
    'agent_requests',
    'agent_request_events',
] as const;

/** Compile backend-owned system models without querying remote storage. */
export const createAnalyticsExplores = (): Explore[] => {
    const sqlBuilder = warehouseSqlBuilderFromType(WarehouseTypes.DUCKDB);
    const compiler = new ExploreCompiler(sqlBuilder);
    const buildTable = (name: (typeof analyticsExploreNames)[number]) => {
        const label = friendlyName(name);
        const base = {
            table: name,
            tableLabel: label,
            fieldType: FieldType.METRIC as const,
            hidden: false,
        };
        const model = {
            content_health: {
                columns: contentHealthColumns,
                metrics: contentHealthMetrics,
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
                columns: agentRequestsColumns,
                metrics: agentRequestsMetrics,
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
            name === 'user_activity' ||
            name === 'tool_activity' ||
            name === 'content_reach' ||
            name === 'content_health' ||
            name === 'agent_requests' ||
            name === 'agent_request_events'
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
        if (name === 'content_reach') {
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
        if (name === 'agent_requests') {
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
        const table = {
            name,
            label,
            ...(name === 'query_events'
                ? { primaryKey: ['org_id', 'query_id'] }
                : {}),
            sqlTable:
                (
                    {
                        tool_activity: toolActivitySql,
                        content_reach: contentReachSql,
                        content_health: contentHealthSql,
                        agent_requests: agentRequestsSql,
                    } as Partial<Record<typeof name, string>>
                )[name] ?? `"${name}"`,
            database: 'memory',
            schema: 'main',
            lineageGraph: { nodes: [], edges: [] },
            dimensions: buildDimensionsFromColumns({
                qualifyColumnReferences: true,
                tableName: name,
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
        if (table.dimensions.user_id)
            table.dimensions.user_id.label = 'User UUID';
        table.dimensions.project_id.label = 'Project UUID';
        if (name === 'content_health') {
            table.dimensions.org_id.hidden = true;
            table.dimensions.observed_viewers.description =
                'Distinct qualifying registered viewers per item across retained history. Do not sum across items.';
            table.dimensions.first_observed_event_at.description =
                'Earliest retained event for this organization; this is not proof of complete capture since that date.';
            table.dimensions.owner_status.description =
                'Current ownership evidence. Not an organization member does not imply employment ended. Creators and editors are not inferred to be owners.';
        }
        if (name === 'content_reach') {
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
        if (name === 'user_activity') {
            table.dimensions.org_id.hidden = true;
            for (const column of userActivityColumns.filter(
                ({ type }) => type === 'BIGINT',
            )) {
                table.dimensions[column.name].hidden = true;
            }
        }
        return table;
    };

    return analyticsExploreNames.map((name) => {
        const dimensions: Exclude<UsageDimensionName, 'content'>[] = [];
        if (name === 'query_events' || name === 'export_events') {
            dimensions.push('charts', 'dashboards', 'users');
        } else if (name !== 'content_health') {
            dimensions.push('users');
        }
        if (
            name === 'ai_usage' ||
            name === 'agent_steps' ||
            name === 'agent_requests' ||
            name === 'agent_request_events' ||
            name === 'tool_activity'
        )
            dimensions.push('agents');
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
                if (dimension === 'users')
                    fields.name.sql = "COALESCE(${TABLE}.name, 'Unknown user')";
                if (dimension === 'agents')
                    fields.name.sql =
                        "COALESCE(${TABLE}.name, 'Unknown agent')";
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
        const label = friendlyName(name);
        const includeQueryMetadata = name === 'export_events';
        const appTableName = 'lightdash_apps';
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
        appFields.name.sql =
            "COALESCE(${TABLE}.name, ${data_app_events.app_id}, 'Unknown app')";
        return compiler.compileExplore({
            name,
            label,
            tags: [],
            baseTable: name,
            joinedTables: [
                ...(name === 'data_app_events'
                    ? [
                          {
                              table: appTableName,
                              type: 'left' as const,
                              relationship: JoinRelationship.MANY_TO_ONE,
                              sqlOn: '${data_app_events.org_id} = ${lightdash_apps.org_id} AND ${data_app_events.project_id} = ${lightdash_apps.project_id} AND ${data_app_events.app_id} = ${lightdash_apps.app_id}',
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
                ...(name === 'data_app_events'
                    ? {
                          [appTableName]: {
                              name: appTableName,
                              label: 'Apps',
                              primaryKey: ['org_id', 'project_id', 'app_id'],
                              sqlTable: `(SELECT org_id, project_id, content_id AS app_id,
                                  content_name AS name, project_name
                                  FROM lightdash_content WHERE content_type = 'data_app')`,
                              database: 'memory',
                              schema: 'main',
                              lineageGraph: { nodes: [], edges: [] },
                              dimensions: appFields,
                              metrics: {},
                          },
                      }
                    : {}),
                ...dimensionTables,
                [name]: buildTable(name),
                ...(includeQueryMetadata
                    ? { query_events: buildTable('query_events') }
                    : {}),
            },
        });
    });
};
