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
                signals: [
                    {
                        name: 'Query tag',
                        where: 'QUERY_HISTORY query_tag, "agent":"true"',
                    },
                    {
                        name: 'Agentic session (person)',
                        where: "SYS_CONTEXT('SNOWFLAKE$CURRENT', 'IS_AGENT_ACTIVATED')",
                    },
                ],
                note: 'The warehouse verifies the session only when the person has done the AI sign-in. Other agent queries carry the query tag.',
                enforce: `CREATE ROW ACCESS POLICY agent_access AS (ai_allowed BOOLEAN)
RETURNS BOOLEAN ->
    NOT COALESCE(SYS_CONTEXT('SNOWFLAKE$CURRENT', 'IS_AGENT_ACTIVATED')::BOOLEAN, FALSE)
    OR ai_allowed;
ALTER TABLE protected_data ADD ROW ACCESS POLICY agent_access ON (ai_allowed);`,
            };
        case WarehouseTypes.POSTGRES:
            return {
                level: AiAgentMarkerLevel.ADVISORY_SESSION,
                signals: [
                    {
                        name: 'application_name',
                        where: 'pg_stat_activity, set to lightdash-ai',
                    },
                    {
                        name: 'Session setting lightdash.agent',
                        where: "current_setting('lightdash.agent', true)",
                    },
                    {
                        name: 'SQL comment',
                        where: 'end of the query text, "agent":"true"',
                    },
                ],
                note: 'Session settings are advisory. Any SQL in the session can change them.',
                enforce: `ALTER TABLE protected_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_access ON protected_data
USING (current_setting('lightdash.agent', true) IS DISTINCT FROM 'true' OR ai_allowed);`,
            };
        case WarehouseTypes.REDSHIFT:
            return {
                level: AiAgentMarkerLevel.ADVISORY_SESSION,
                signals: [
                    {
                        name: 'application_name',
                        where: "current_setting('application_name'), set to lightdash-ai",
                    },
                    {
                        name: 'Session setting lightdash.agent',
                        where: "current_setting('lightdash.agent', false)",
                    },
                    {
                        name: 'SQL comment',
                        where: 'sys_query_history query_text, "agent":"true"',
                    },
                ],
                note: 'Session settings are advisory. Any SQL in the session can change them.',
                enforce: `CREATE RLS POLICY agent_access WITH (ai_allowed BOOLEAN)
USING (COALESCE(current_setting('lightdash.agent', false), 'false') <> 'true' OR ai_allowed);
ATTACH RLS POLICY agent_access ON protected_data TO PUBLIC;
ALTER TABLE protected_data ROW LEVEL SECURITY ON;`,
            };
        case WarehouseTypes.DATABRICKS:
            return {
                level: AiAgentMarkerLevel.IDENTIFY_ONLY,
                signals: [
                    {
                        name: 'SQL comment',
                        where: 'query history, "agent":"true"',
                    },
                ],
                note: null,
                enforce: null,
            };
        case WarehouseTypes.BIGQUERY:
            return {
                level: AiAgentMarkerLevel.IDENTIFY_ONLY,
                signals: [
                    {
                        name: 'Job label',
                        where: 'INFORMATION_SCHEMA.JOBS labels, agent=true',
                    },
                ],
                note: null,
                enforce: null,
            };
        case WarehouseTypes.ATHENA:
            return {
                level: AiAgentMarkerLevel.IDENTIFY_ONLY,
                signals: [
                    {
                        name: 'SQL comment',
                        where: 'query history, "agent":"true"',
                    },
                ],
                note: null,
                enforce: null,
            };
        case WarehouseTypes.CLICKHOUSE:
            return {
                level: AiAgentMarkerLevel.IDENTIFY_ONLY,
                signals: [
                    {
                        name: 'log_comment',
                        where: 'system.query_log, "agent":"true"',
                    },
                ],
                note: null,
                enforce: null,
            };
        case WarehouseTypes.TRINO:
            return {
                level: AiAgentMarkerLevel.IDENTIFY_ONLY,
                signals: [
                    { name: 'Client tag', where: 'client tags, agent=true' },
                    {
                        name: 'SQL comment',
                        where: 'system.runtime.queries query text, "agent":"true"',
                    },
                ],
                note: 'Access control plugins can read client tags.',
                enforce: null,
            };
        case WarehouseTypes.DUCKDB:
            return {
                level: AiAgentMarkerLevel.NONE,
                signals: [],
                note: null,
                enforce: null,
            };
        default:
            return assertUnreachable(type, 'Unknown warehouse type');
    }
};
