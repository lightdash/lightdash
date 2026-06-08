import { buildDataTimezonePreviewSql } from './dataTimezonePreview';
import { SupportedDbtAdapter } from './dbt';

describe('buildDataTimezonePreviewSql', () => {
    it('selects raw now plus naive-now disambiguated for effective and UTC (postgres)', () => {
        const sql = buildDataTimezonePreviewSql(
            SupportedDbtAdapter.POSTGRES,
            'America/New_York',
        );
        expect(sql).toBe(
            'SELECT CURRENT_TIMESTAMP AS raw, ' +
                "(LOCALTIMESTAMP) AT TIME ZONE 'America/New_York' AS effective_instant, " +
                "(LOCALTIMESTAMP) AT TIME ZONE 'UTC' AS utc_instant",
        );
    });

    it('uses the snowflake NTZ naive-now and CONVERT_TIMEZONE', () => {
        const sql = buildDataTimezonePreviewSql(
            SupportedDbtAdapter.SNOWFLAKE,
            'Europe/London',
        );
        expect(sql).toContain('CAST(CURRENT_TIMESTAMP() AS TIMESTAMP_NTZ)');
        expect(sql).toContain(
            "CONVERT_TIMEZONE('Europe/London', 'UTC', CAST(CURRENT_TIMESTAMP() AS TIMESTAMP_NTZ))",
        );
        expect(sql).toContain('AS utc_instant');
    });
});
