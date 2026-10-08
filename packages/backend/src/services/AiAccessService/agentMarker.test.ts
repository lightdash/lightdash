import { AiAgentMarkerLevel, WarehouseTypes } from '@lightdash/common';
import { describeAgentMarker } from './agentMarker';

const levels: Record<WarehouseTypes, AiAgentMarkerLevel> = {
    [WarehouseTypes.SNOWFLAKE]: AiAgentMarkerLevel.VERIFIED_SESSION,
    [WarehouseTypes.POSTGRES]: AiAgentMarkerLevel.IDENTIFY_ONLY,
    [WarehouseTypes.REDSHIFT]: AiAgentMarkerLevel.IDENTIFY_ONLY,
    [WarehouseTypes.DATABRICKS]: AiAgentMarkerLevel.IDENTIFY_ONLY,
    [WarehouseTypes.BIGQUERY]: AiAgentMarkerLevel.IDENTIFY_ONLY,
    [WarehouseTypes.ATHENA]: AiAgentMarkerLevel.IDENTIFY_ONLY,
    [WarehouseTypes.CLICKHOUSE]: AiAgentMarkerLevel.IDENTIFY_ONLY,
    [WarehouseTypes.TRINO]: AiAgentMarkerLevel.REQUEST_BOUND,
    [WarehouseTypes.DUCKDB]: AiAgentMarkerLevel.NONE,
};

describe('describeAgentMarker', () => {
    test.each(Object.values(WarehouseTypes))('describes %s', (type) => {
        const marker = describeAgentMarker(type);
        expect(marker.level).toBe(levels[type]);
        expect(JSON.stringify(marker)).not.toContain('Lightdash');
        expect(marker.signals.length > 0).toBe(type !== WarehouseTypes.DUCKDB);
        expect(marker.enforce !== null).toBe(
            [WarehouseTypes.SNOWFLAKE, WarehouseTypes.TRINO].includes(type),
        );
    });

    test('gives each Postgres marker a read location and an identification-only note', () => {
        expect(describeAgentMarker(WarehouseTypes.POSTGRES)).toMatchObject({
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
            note: 'The session setting and application name identify agent sessions in pg_stat_activity. They are not a control: any SQL in the session can change them. Use a separate principal for a hard boundary.',
        });
    });

    test('uses extra credentials for Trino access control rather than client tags', () => {
        const marker = describeAgentMarker(WarehouseTypes.TRINO);
        expect(marker.enforce).toContain(
            'input.context.identity.extraCredentials.agent == "true"',
        );
        expect(marker.note).toContain(
            'Trino 484 with opa.identity.extra-credentials-keys=agent',
        );
        expect(
            marker.signals.find((signal) => signal.name === 'Client tag')
                ?.where,
        ).toContain('not access control');
        expect(
            marker.signals.find((signal) => signal.name === 'User-Agent')
                ?.where,
        ).toContain('Ranger clientType');
    });

    test('describes ClickHouse markers as identification only', () => {
        const marker = describeAgentMarker(WarehouseTypes.CLICKHOUSE);
        expect(marker.enforce).toBeNull();
        expect(marker.note).toBe(
            "The log comment identifies agent queries in system.query_log. A custom setting is not a control: the query's own SETTINGS clause can change it. A hard boundary needs a separate user or a role switched on per request.",
        );
    });

    test('uses the verified Snowflake agent session expression', () => {
        expect(describeAgentMarker(WarehouseTypes.SNOWFLAKE).enforce).toContain(
            "SYS_CONTEXT('SNOWFLAKE$CURRENT', 'IS_AGENT_ACTIVATED')::BOOLEAN",
        );
    });
});
