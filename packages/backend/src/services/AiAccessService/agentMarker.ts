import {
    AiAgentMarkerLevel,
    assertUnreachable,
    WarehouseTypes,
    type AiAgentMarker,
} from '@lightdash/common';

export const describeAgentMarker = (type: WarehouseTypes): AiAgentMarker => {
    switch (type) {
        case WarehouseTypes.SNOWFLAKE:
            return {
                level: AiAgentMarkerLevel.VERIFIED_SESSION,
                channels: ['Query tag', 'Agentic session (person)'],
                identify:
                    'QUERY_HISTORY query_tag JSON contains "agent":"true". Person principals use verified agentic sessions; other queries carry the query tag only.',
                enforce: `CREATE ROW ACCESS POLICY agent_access AS (ai_allowed BOOLEAN)
RETURNS BOOLEAN ->
    NOT COALESCE(SYS_CONTEXT('SNOWFLAKE$CURRENT', 'IS_AGENT_ACTIVATED')::BOOLEAN, FALSE)
    OR ai_allowed;
ALTER TABLE protected_data ADD ROW ACCESS POLICY agent_access ON (ai_allowed);`,
            };
        case WarehouseTypes.POSTGRES:
            return {
                level: AiAgentMarkerLevel.ADVISORY_SESSION,
                channels: [
                    'application_name',
                    'Session setting lightdash.agent',
                    'SQL comment',
                ],
                identify:
                    'pg_stat_activity.application_name is lightdash-ai. Query text ends with a JSON comment containing "agent":"true". Session settings are advisory and can be changed by SQL.',
                enforce: `ALTER TABLE protected_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_access ON protected_data
USING (current_setting('lightdash.agent', true) IS DISTINCT FROM 'true' OR ai_allowed);`,
            };
        case WarehouseTypes.REDSHIFT:
            return {
                level: AiAgentMarkerLevel.ADVISORY_SESSION,
                channels: [
                    'application_name',
                    'Session context variable lightdash.agent',
                    'SQL comment',
                ],
                identify:
                    'Inspect sessions in stv_sessions and the "agent":"true" SQL comment in sys_query_history. This instance sets application_name to lightdash-ai. Session variables are advisory and can be changed by SQL.',
                enforce: `CREATE RLS POLICY agent_access WITH (ai_allowed BOOLEAN)
USING (COALESCE(current_setting('lightdash.agent', false), 'false') <> 'true' OR ai_allowed);
ATTACH RLS POLICY agent_access ON protected_data TO PUBLIC;
ALTER TABLE protected_data ROW LEVEL SECURITY ON;`,
            };
        case WarehouseTypes.DATABRICKS:
            return {
                level: AiAgentMarkerLevel.IDENTIFY_ONLY,
                channels: ['SQL comment in query history'],
                identify:
                    'Query history SQL contains a JSON comment with "agent":"true".',
                enforce: null,
            };
        case WarehouseTypes.BIGQUERY:
            return {
                level: AiAgentMarkerLevel.IDENTIFY_ONLY,
                channels: ['Job label'],
                identify: 'INFORMATION_SCHEMA.JOBS labels contain agent=true.',
                enforce: null,
            };
        case WarehouseTypes.ATHENA:
            return {
                level: AiAgentMarkerLevel.IDENTIFY_ONLY,
                channels: ['SQL comment in query history'],
                identify:
                    'Query history SQL contains a JSON comment with "agent":"true".',
                enforce: null,
            };
        case WarehouseTypes.CLICKHOUSE:
            return {
                level: AiAgentMarkerLevel.IDENTIFY_ONLY,
                channels: ['log_comment'],
                identify:
                    'system.query_log.log_comment contains JSON with "agent":"true".',
                enforce: null,
            };
        case WarehouseTypes.TRINO:
            return {
                level: AiAgentMarkerLevel.IDENTIFY_ONLY,
                channels: ['Client tag', 'SQL comment'],
                identify:
                    'Client tags contain agent=true. Inspect query text in system.runtime.queries for the "agent":"true" SQL comment. Access control plugins can read client tags.',
                enforce: null,
            };
        case WarehouseTypes.DUCKDB:
            return {
                level: AiAgentMarkerLevel.NONE,
                channels: [],
                identify: 'This warehouse has no agent marker channel.',
                enforce: null,
            };
        default:
            return assertUnreachable(type, 'Unknown warehouse type');
    }
};
