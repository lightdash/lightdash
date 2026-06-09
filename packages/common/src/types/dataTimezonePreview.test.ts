import {
    buildDataTimezonePreviewResponse,
    buildDataTimezonePreviewSql,
} from './dataTimezonePreview';
import { SupportedDbtAdapter } from './dbt';
import { ParameterError } from './errors';
import { WarehouseTypes } from './projects';

const NOW = '2026-06-08 14:30:00';

describe('buildDataTimezonePreviewSql', () => {
    it('interprets the fixed wall-clock literal under the data timezone (postgres)', () => {
        const sql = buildDataTimezonePreviewSql(
            SupportedDbtAdapter.POSTGRES,
            'America/New_York',
            NOW,
        );
        expect(sql).toBe(
            "SELECT (TIMESTAMP '2026-06-08 14:30:00') AT TIME ZONE " +
                "'America/New_York' AS naive_instant",
        );
    });

    it('wraps the literal as TIMESTAMP_NTZ inside CONVERT_TIMEZONE (snowflake)', () => {
        const sql = buildDataTimezonePreviewSql(
            SupportedDbtAdapter.SNOWFLAKE,
            'Europe/London',
            NOW,
        );
        expect(sql).toBe(
            "SELECT CONVERT_TIMEZONE('Europe/London', 'UTC', " +
                "'2026-06-08 14:30:00'::TIMESTAMP_NTZ) AS naive_instant",
        );
    });

    it('parses the literal string under the data timezone (clickhouse)', () => {
        const sql = buildDataTimezonePreviewSql(
            SupportedDbtAdapter.CLICKHOUSE,
            'America/New_York',
            NOW,
        );
        expect(sql).toBe(
            "SELECT toTimeZone(toDateTime('2026-06-08 14:30:00', " +
                "'America/New_York'), 'UTC') AS naive_instant",
        );
    });

    it('injects the same literal across warehouses (timezone-independent preview)', () => {
        const adapters = [
            SupportedDbtAdapter.POSTGRES,
            SupportedDbtAdapter.SNOWFLAKE,
            SupportedDbtAdapter.TRINO,
            SupportedDbtAdapter.CLICKHOUSE,
            SupportedDbtAdapter.DATABRICKS,
        ];
        adapters.forEach((adapter) => {
            const sql = buildDataTimezonePreviewSql(adapter, 'UTC', NOW);
            expect(sql).toContain('2026-06-08 14:30:00');
            expect(sql).not.toContain('now()');
            expect(sql).not.toContain('CURRENT_TIMESTAMP');
        });
    });

    it('rejects a non-IANA timezone before building SQL', () => {
        expect(() =>
            buildDataTimezonePreviewSql(
                SupportedDbtAdapter.POSTGRES,
                "x'; DROP TABLE users; --",
                NOW,
            ),
        ).toThrow(ParameterError);
    });

    it('rejects a malformed wall-clock literal', () => {
        expect(() =>
            buildDataTimezonePreviewSql(
                SupportedDbtAdapter.POSTGRES,
                'America/New_York',
                "2026-06-08'; DROP TABLE users; --",
            ),
        ).toThrow(ParameterError);
    });
});

describe('buildDataTimezonePreviewResponse', () => {
    // naive "now" disambiguated as New York -> this UTC instant; the aware
    // instant is derived from nowWallClock (the same moment, read as UTC).
    const row = {
        naive_instant: '2026-06-08T18:30:00.000Z', // NY 14:30 naive -> 18:30 UTC
    };

    it('splits the preview into an affected naive group and an unaffected aware group', () => {
        const res = buildDataTimezonePreviewResponse({
            row,
            warehouseType: WarehouseTypes.POSTGRES,
            selectedDataTimezone: 'America/New_York',
            effectiveSourceTimezone: 'America/New_York',
            projectTimezone: 'UTC',
            nowWallClock: NOW,
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

    it('reads Date-object rows as instants, not via String() (pg/snowflake drivers)', () => {
        // pg, Snowflake, etc. return Date objects, not ISO strings. String()-ing
        // a Date before moment.utc parses the locale string via a fallback that
        // drops the offset, shifting every value by the backend's UTC offset.
        const res = buildDataTimezonePreviewResponse({
            row: { naive_instant: new Date('2026-06-08T18:30:00.000Z') },
            warehouseType: WarehouseTypes.POSTGRES,
            selectedDataTimezone: 'America/New_York',
            effectiveSourceTimezone: 'America/New_York',
            projectTimezone: 'UTC',
            nowWallClock: NOW,
        });

        // Identical to the ISO-string row above: the instant is preserved
        // regardless of the timezone the backend process runs in.
        expect(res.naive.raw).toBe('2026-06-08, 14:30:00');
        expect(res.naive.readAs).toBe('2026-06-08, 14:30:00 (-04:00)');
        expect(res.naive.rendered).toBe('2026-06-08, 18:30:00 (+00:00)');
        expect(res.aware.raw).toBe('2026-06-08, 14:30:00 (+00:00)');
        expect(res.aware.rendered).toBe('2026-06-08, 14:30:00 (+00:00)');
    });

    it('reads the column case-insensitively (snowflake upper-cases aliases)', () => {
        const res = buildDataTimezonePreviewResponse({
            row: { NAIVE_INSTANT: '2026-06-08T18:30:00.000Z' },
            warehouseType: WarehouseTypes.SNOWFLAKE,
            selectedDataTimezone: 'America/New_York',
            effectiveSourceTimezone: 'America/New_York',
            projectTimezone: 'UTC',
            nowWallClock: NOW,
        });
        // Without the case-insensitive read, naive_instant is undefined and
        // moment.utc(undefined) silently returns "now", collapsing onto aware.
        expect(res.naive.rendered).toBe('2026-06-08, 18:30:00 (+00:00)');
        expect(res.aware.raw).toBe('2026-06-08, 14:30:00 (+00:00)');
    });

    it('flags dataTimezoneApplies=false when the effective zone is UTC', () => {
        const res = buildDataTimezonePreviewResponse({
            row,
            warehouseType: WarehouseTypes.SNOWFLAKE,
            selectedDataTimezone: 'America/New_York',
            effectiveSourceTimezone: 'UTC',
            projectTimezone: 'UTC',
            nowWallClock: NOW,
        });
        expect(res.dataTimezoneApplies).toBe(false);
        expect(res.naive.interpretedAs).toBe('UTC');
    });
});
