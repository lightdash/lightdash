import {
    buildDataTimezonePreviewResponse,
    buildDataTimezonePreviewSql,
} from './dataTimezonePreview';
import { SupportedDbtAdapter } from './dbt';
import { WarehouseTypes } from './projects';

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

describe('buildDataTimezonePreviewResponse', () => {
    const row = {
        raw: '2026-06-08T14:30:00.000Z',
        effective_instant: '2026-06-08T18:30:00.000', // NY naive -> UTC
        utc_instant: '2026-06-08T14:30:00.000',
    };

    it('renders both instants in the project timezone', () => {
        const res = buildDataTimezonePreviewResponse({
            row,
            warehouseType: WarehouseTypes.POSTGRES,
            selectedDataTimezone: 'America/New_York',
            effectiveSourceTimezone: 'America/New_York',
            projectTimezone: 'UTC',
        });
        expect(res.raw).toBe('2026-06-08T14:30:00.000Z');
        expect(res.effective.interpretedAs).toBe('America/New_York');
        expect(res.effective.instant).toBe('2026-06-08T18:30:00.000');
        expect(res.effective.rendered).toBe(
            '2026-06-08, 18:30:00:000 (+00:00)',
        );
        expect(res.utcBaseline.interpretedAs).toBe('UTC');
        expect(res.utcBaseline.rendered).toBe(
            '2026-06-08, 14:30:00:000 (+00:00)',
        );
    });
});
