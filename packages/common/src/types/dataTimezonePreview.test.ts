import {
    buildDataTimezonePreviewResponse,
    buildDataTimezonePreviewSql,
} from './dataTimezonePreview';
import { SupportedDbtAdapter } from './dbt';
import { WarehouseTypes } from './projects';

describe('buildDataTimezonePreviewSql', () => {
    it('selects the aware now and the naive now disambiguated under the effective zone (postgres)', () => {
        const sql = buildDataTimezonePreviewSql(
            SupportedDbtAdapter.POSTGRES,
            'America/New_York',
        );
        expect(sql).toBe(
            'SELECT CURRENT_TIMESTAMP AS aware_instant, ' +
                "(LOCALTIMESTAMP) AT TIME ZONE 'America/New_York' AS naive_instant",
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
        expect(sql).toContain('AS naive_instant');
    });
});

describe('buildDataTimezonePreviewResponse', () => {
    // naive "now" disambiguated as New York -> this UTC instant;
    // aware "now" is the same wall moment already pinned.
    const row = {
        naive_instant: '2026-06-08T18:30:00.000Z', // NY 14:30 naive -> 18:30 UTC
        aware_instant: '2026-06-08T14:30:00.000Z',
    };

    it('splits the preview into an affected naive group and an unaffected aware group', () => {
        const res = buildDataTimezonePreviewResponse({
            row,
            warehouseType: WarehouseTypes.POSTGRES,
            selectedDataTimezone: 'America/New_York',
            effectiveSourceTimezone: 'America/New_York',
            projectTimezone: 'UTC',
        });

        expect(res.dataTimezoneApplies).toBe(true);

        // Naive group: read as New York, then rendered in the project tz (UTC).
        expect(res.naive.interpretedAs).toBe('America/New_York');
        expect(res.naive.raw).toBe('2026-06-08, 14:30:00');
        expect(res.naive.readAs).toBe('2026-06-08, 14:30:00 (-04:00)');
        expect(res.naive.rendered).toBe('2026-06-08, 18:30:00 (+00:00)');

        // Aware group: instant already pinned, shown in UTC then project tz.
        expect(res.aware.raw).toBe('2026-06-08, 14:30:00 (+00:00)');
        expect(res.aware.rendered).toBe('2026-06-08, 14:30:00 (+00:00)');
    });

    it('flags dataTimezoneApplies=false when the effective zone is UTC', () => {
        const res = buildDataTimezonePreviewResponse({
            row,
            warehouseType: WarehouseTypes.SNOWFLAKE,
            selectedDataTimezone: 'America/New_York',
            effectiveSourceTimezone: 'UTC',
            projectTimezone: 'UTC',
        });
        expect(res.dataTimezoneApplies).toBe(false);
        expect(res.naive.interpretedAs).toBe('UTC');
    });
});
