import { AiAgentMarkerLevel, WarehouseTypes } from '@lightdash/common';
import { describeAgentMarker } from './agentMarker';

const levels: Record<WarehouseTypes, AiAgentMarkerLevel> = {
    [WarehouseTypes.SNOWFLAKE]: AiAgentMarkerLevel.VERIFIED_SESSION,
    [WarehouseTypes.POSTGRES]: AiAgentMarkerLevel.ADVISORY_SESSION,
    [WarehouseTypes.REDSHIFT]: AiAgentMarkerLevel.ADVISORY_SESSION,
    [WarehouseTypes.DATABRICKS]: AiAgentMarkerLevel.IDENTIFY_ONLY,
    [WarehouseTypes.BIGQUERY]: AiAgentMarkerLevel.IDENTIFY_ONLY,
    [WarehouseTypes.ATHENA]: AiAgentMarkerLevel.IDENTIFY_ONLY,
    [WarehouseTypes.CLICKHOUSE]: AiAgentMarkerLevel.IDENTIFY_ONLY,
    [WarehouseTypes.TRINO]: AiAgentMarkerLevel.IDENTIFY_ONLY,
    [WarehouseTypes.DUCKDB]: AiAgentMarkerLevel.NONE,
};

describe('describeAgentMarker', () => {
    test.each(Object.values(WarehouseTypes))('describes %s', (type) => {
        const marker = describeAgentMarker(type);
        expect(marker.level).toBe(levels[type]);
        expect(marker.identify).not.toContain('Lightdash');
        expect(marker.channels.length > 0).toBe(type !== WarehouseTypes.DUCKDB);
        expect(marker.enforce !== null).toBe(
            [
                WarehouseTypes.SNOWFLAKE,
                WarehouseTypes.POSTGRES,
                WarehouseTypes.REDSHIFT,
            ].includes(type),
        );
    });

    test('uses the verified Snowflake agent session expression', () => {
        expect(describeAgentMarker(WarehouseTypes.SNOWFLAKE).enforce).toContain(
            "SYS_CONTEXT('SNOWFLAKE$CURRENT', 'IS_AGENT_ACTIVATED')::BOOLEAN",
        );
    });
});
