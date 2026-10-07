import { WarehouseTypes } from '@lightdash/common';
import { agentMarkerProbe } from './agentMarkerProbe';

describe('agent marker probes', () => {
    test('reads optional Postgres settings', () => {
        expect(agentMarkerProbe(WarehouseTypes.POSTGRES).sql).toContain(
            "current_setting('lightdash.agent', true)",
        );
    });
    test('uses Redshift session context semantics', () => {
        expect(agentMarkerProbe(WarehouseTypes.REDSHIFT).sql).toContain(
            "current_setting('lightdash.agent', false)",
        );
    });
    test('checks the Snowflake agent session even without the query tag function', () => {
        const probe = agentMarkerProbe(WarehouseTypes.SNOWFLAKE);
        expect(probe.sql).toContain('CURRENT_QUERY_TAG()');
        expect(probe.fallbackSql).toContain(
            "SYS_CONTEXT('SNOWFLAKE$CURRENT', 'IS_AGENT_ACTIVATED')::BOOLEAN",
        );
    });
    test.each([
        WarehouseTypes.BIGQUERY,
        WarehouseTypes.ATHENA,
        WarehouseTypes.DATABRICKS,
        WarehouseTypes.CLICKHOUSE,
        WarehouseTypes.TRINO,
        WarehouseTypes.DUCKDB,
    ])('uses a read-only query for %s', (type) => {
        expect(agentMarkerProbe(type)).toEqual({
            sql: 'SELECT 1',
            fallbackSql: null,
        });
    });
});
