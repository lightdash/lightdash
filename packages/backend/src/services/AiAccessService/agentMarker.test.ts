import { AiAgentMarkerLevel, WarehouseTypes } from '@lightdash/common';
import { describeAgentMarker } from './agentMarker';

const levels: Record<WarehouseTypes, AiAgentMarkerLevel> = {
    [WarehouseTypes.SNOWFLAKE]: AiAgentMarkerLevel.VERIFIED_SESSION,
    [WarehouseTypes.POSTGRES]: AiAgentMarkerLevel.ADVISORY_SESSION,
    [WarehouseTypes.REDSHIFT]: AiAgentMarkerLevel.ADVISORY_SESSION,
    [WarehouseTypes.DATABRICKS]: AiAgentMarkerLevel.IDENTIFY_ONLY,
    [WarehouseTypes.BIGQUERY]: AiAgentMarkerLevel.IDENTIFY_ONLY,
    [WarehouseTypes.ATHENA]: AiAgentMarkerLevel.IDENTIFY_ONLY,
    [WarehouseTypes.CLICKHOUSE]: AiAgentMarkerLevel.ADVISORY_SESSION,
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
            [
                WarehouseTypes.SNOWFLAKE,
                WarehouseTypes.POSTGRES,
                WarehouseTypes.REDSHIFT,
                WarehouseTypes.CLICKHOUSE,
                WarehouseTypes.TRINO,
            ].includes(type),
        );
    });

    test('gives each Postgres marker a read location and an advisory note', () => {
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
            note: 'Session settings are advisory. Any SQL in the session can change them.',
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

    test('describes ClickHouse role enforcement as a feature not yet sent by the app', () => {
        const marker = describeAgentMarker(WarehouseTypes.CLICKHOUSE);
        expect(marker.enforce).toContain('USING NOT pii TO agent_role');
        expect(marker.note).toContain(
            'role=agent_role; this is not yet a feature here',
        );
        expect(marker.note).toContain("getSetting('SQL_agent')");
    });

    test('uses the verified Snowflake agent session expression', () => {
        expect(describeAgentMarker(WarehouseTypes.SNOWFLAKE).enforce).toContain(
            "SYS_CONTEXT('SNOWFLAKE$CURRENT', 'IS_AGENT_ACTIVATED')::BOOLEAN",
        );
    });
});
