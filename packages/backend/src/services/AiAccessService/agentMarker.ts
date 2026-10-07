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
                note: 'Unity Catalog attribute-based policies (Beta) can branch on `request.client_id`, which is fixed by how the token was issued. To enforce on agents, register a separate OAuth app for agent sign-in and match its client id. Personal access tokens bypass it.',
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
                note: 'Row access policies, policy tags and masking decide on identity only. Google recommends a separate identity for agents.',
                enforce: null,
            };
        case WarehouseTypes.ATHENA:
            return {
                level: AiAgentMarkerLevel.IDENTIFY_ONLY,
                signals: [
                    {
                        name: 'SQL comment',
                        where: 'query history and CloudTrail, "agent":"true"',
                    },
                ],
                note: 'Lake Formation can grant on session tags set at AssumeRole, which the query cannot change. That needs agents to assume their own role.',
                enforce: null,
            };
        case WarehouseTypes.CLICKHOUSE:
            return {
                level: AiAgentMarkerLevel.ADVISORY_SESSION,
                signals: [
                    {
                        name: 'log_comment',
                        where: 'system.query_log, "agent":"true"',
                    },
                ],
                note: "A row policy can read getSetting('SQL_agent'), but the query's SETTINGS clause can change it. Prefer the HTTP role parameter: it activates an agent role whose grants and row policies apply and which SQL cannot drop. EXECUTE AS is the only identity SQL cannot change, but is not available in ClickHouse Cloud. The app would need to send role=agent_role; this is not yet a feature here.",
                enforce:
                    'CREATE ROW POLICY agent_access ON protected_data USING NOT pii TO agent_role;',
            };
        case WarehouseTypes.TRINO:
            return {
                level: AiAgentMarkerLevel.REQUEST_BOUND,
                signals: [
                    {
                        name: 'Client tag',
                        where: 'agent=true; resource groups, session property managers and event listeners, not access control',
                    },
                    {
                        name: 'Extra credential',
                        where: 'agent=true; OPA identity.extraCredentials from Trino 484 with opa.identity.extra-credentials-keys=agent',
                    },
                    {
                        name: 'User-Agent',
                        where: 'lightdash-ai; Ranger clientType',
                    },
                    {
                        name: 'SQL comment',
                        where: 'Ranger query text and system.runtime.queries query, "agent":"true"',
                    },
                ],
                note: 'Agent SQL must not contain SET ROLE or SET SESSION AUTHORIZATION; this instance does not parse SQL, so grant agents no roles they must not use. The OPA example needs Trino 484 with opa.identity.extra-credentials-keys=agent.',
                enforce: `package trino
import rego.v1

default rowFilters := []

rowFilters := [{"expression": "NOT pii"}] if {
    input.context.identity.extraCredentials.agent == "true"
    input.action.resource.table.tableName == "protected_data"
}`,
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
