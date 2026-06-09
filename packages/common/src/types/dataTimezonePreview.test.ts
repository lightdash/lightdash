import {
    buildDataTimezonePreviewResponse,
    buildDataTimezonePreviewSql,
} from './dataTimezonePreview';
import { SupportedDbtAdapter } from './dbt';
import { ParameterError } from './errors';

const NOW = '2026-06-08 14:30:00';

describe('buildDataTimezonePreviewSql', () => {
    it('reads the wall-clock through the session timezone (postgres)', () => {
        expect(
            buildDataTimezonePreviewSql(SupportedDbtAdapter.POSTGRES, NOW),
        ).toBe(
            "SELECT to_char((TIMESTAMP '2026-06-08 14:30:00')::timestamptz " +
                "AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS naive_instant",
        );
    });

    it('reads the wall-clock through the session timezone (snowflake)', () => {
        expect(
            buildDataTimezonePreviewSql(SupportedDbtAdapter.SNOWFLAKE, NOW),
        ).toBe(
            "SELECT TO_CHAR(CONVERT_TIMEZONE('UTC', " +
                "'2026-06-08 14:30:00'::TIMESTAMP_NTZ), " +
                "'YYYY-MM-DD HH24:MI:SS') AS naive_instant",
        );
    });

    it('reads the wall-clock through the session timezone (clickhouse)', () => {
        expect(
            buildDataTimezonePreviewSql(SupportedDbtAdapter.CLICKHOUSE, NOW),
        ).toBe(
            "SELECT toString(toTimeZone(toDateTime('2026-06-08 14:30:00'), " +
                "'UTC')) AS naive_instant",
        );
    });

    it('never hardcodes a zone - the session does the interpreting', () => {
        const adapters = [
            SupportedDbtAdapter.POSTGRES,
            SupportedDbtAdapter.SNOWFLAKE,
            SupportedDbtAdapter.TRINO,
            SupportedDbtAdapter.CLICKHOUSE,
            SupportedDbtAdapter.DATABRICKS,
        ];
        adapters.forEach((adapter) => {
            const sql = buildDataTimezonePreviewSql(adapter, NOW);
            expect(sql).toContain('2026-06-08 14:30:00');
            // The only zone literal is the UTC normalisation, never a data tz.
            expect(sql).not.toContain('America');
            expect(sql).not.toContain('now()');
        });
    });

    it('rejects a malformed wall-clock literal', () => {
        expect(() =>
            buildDataTimezonePreviewSql(
                SupportedDbtAdapter.POSTGRES,
                "2026-06-08'; DROP TABLE users; --",
            ),
        ).toThrow(ParameterError);
    });
});

describe('buildDataTimezonePreviewResponse', () => {
    it('renders the data-timezone case (naive read in the set zone)', () => {
        // Session = America/New_York, so the warehouse read NOW (14:30) as NY
        // and returned the UTC instant 18:30.
        const res = buildDataTimezonePreviewResponse({
            row: { naive_instant: '2026-06-08 18:30:00' },
            nowWallClock: NOW,
            projectTimezone: 'UTC',
            dataTimezone: 'America/New_York',
        });

        expect(res.dataTimezoneApplies).toBe(true);
        expect(res.naive.interpretedAs).toBe('America/New_York');
        expect(res.naive.raw).toBe('2026-06-08, 14:30:00');
        expect(res.naive.readAs).toBe('2026-06-08, 14:30:00 (-04:00)');
        expect(res.naive.rendered).toBe('2026-06-08, 18:30:00 (+00:00)');
        expect(res.aware.raw).toBe('2026-06-08, 14:30:00 (+00:00)');
        expect(res.aware.rendered).toBe('2026-06-08, 14:30:00 (+00:00)');
    });

    it('labels the unset case by the warehouse default offset (non-UTC)', () => {
        // No data timezone set; the warehouse default is +02:00, so it read NOW
        // (14:30) as 12:30 UTC.
        const res = buildDataTimezonePreviewResponse({
            row: { naive_instant: '2026-06-08 12:30:00' },
            nowWallClock: NOW,
            projectTimezone: 'UTC',
            dataTimezone: undefined,
        });

        expect(res.dataTimezoneApplies).toBe(false);
        expect(res.naive.interpretedAs).toBe('UTC+02:00');
        expect(res.naive.raw).toBe('2026-06-08, 14:30:00');
        expect(res.naive.readAs).toBe('2026-06-08, 14:30:00 (+02:00)');
        expect(res.naive.rendered).toBe('2026-06-08, 12:30:00 (+00:00)');
    });

    it('labels the unset case as UTC when the warehouse default is UTC', () => {
        const res = buildDataTimezonePreviewResponse({
            row: { naive_instant: '2026-06-08 14:30:00' },
            nowWallClock: NOW,
            projectTimezone: 'UTC',
            dataTimezone: undefined,
        });

        expect(res.dataTimezoneApplies).toBe(false);
        expect(res.naive.interpretedAs).toBe('UTC');
        expect(res.naive.readAs).toBe('2026-06-08, 14:30:00 (+00:00)');
    });

    it('does not claim the set zone when the warehouse ignored it', () => {
        // Data tz set to NY, but the warehouse read the literal as UTC anyway
        // (e.g. no session-TZ plumbing). The label must reflect what happened.
        const res = buildDataTimezonePreviewResponse({
            row: { naive_instant: '2026-06-08 14:30:00' },
            nowWallClock: NOW,
            projectTimezone: 'UTC',
            dataTimezone: 'America/New_York',
        });

        expect(res.dataTimezoneApplies).toBe(true);
        expect(res.naive.interpretedAs).toBe('UTC');
        expect(res.naive.readAs).toBe('2026-06-08, 14:30:00 (+00:00)');
    });

    it('reads the column case-insensitively (snowflake upper-cases aliases)', () => {
        const res = buildDataTimezonePreviewResponse({
            row: { NAIVE_INSTANT: '2026-06-08 18:30:00' },
            nowWallClock: NOW,
            projectTimezone: 'UTC',
            dataTimezone: 'America/New_York',
        });
        expect(res.naive.rendered).toBe('2026-06-08, 18:30:00 (+00:00)');
    });
});
