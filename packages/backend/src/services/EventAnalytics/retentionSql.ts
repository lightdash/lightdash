import {
    computeRetentionAverages,
    DimensionType,
    getLastCompleteRetentionPeriod,
    getSqlForTruncatedDate,
    ParameterError,
    resolveEventAnalyticsDateRange,
    RETENTION_MAX_PERIODS,
    TimeFrames,
    TimeIntervalUnit,
    type Explore,
    type RetentionCohortResult,
    type RetentionQueryRequest,
    type RetentionQueryResult,
    type RetentionUnit,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import {
    ACTIVITY_COLUMNS,
    ActivityStreamQuery,
    resolveActivityStream,
} from './activityStream';

const UNIT_TIME_FRAME: Record<RetentionUnit, TimeFrames> = {
    day: TimeFrames.DAY,
    week: TimeFrames.WEEK,
    month: TimeFrames.MONTH,
};

const UNIT_INTERVAL: Record<RetentionUnit, TimeIntervalUnit> = {
    day: TimeIntervalUnit.DAY,
    week: TimeIntervalUnit.WEEK,
    month: TimeIntervalUnit.MONTH,
};

// Rolling periods are fixed lengths from the birth event. A rolling month is 30 days.
const UNIT_SECONDS: Record<RetentionUnit, number> = {
    day: 24 * 60 * 60,
    week: 7 * 24 * 60 * 60,
    month: 30 * 24 * 60 * 60,
};

export const validateRetentionRequest = (request: RetentionQueryRequest) => {
    if (!request.bornEvent) {
        throw new ParameterError('A born event is required');
    }
    if (!Number.isInteger(request.periods) || request.periods < 1) {
        throw new ParameterError('periods must be a positive integer');
    }
    if (request.periods > RETENTION_MAX_PERIODS[request.unit]) {
        throw new ParameterError(
            `periods cannot exceed ${
                RETENTION_MAX_PERIODS[request.unit]
            } for unit '${request.unit}'`,
        );
    }
};

type GenerateRetentionSqlArgs = {
    request: RetentionQueryRequest;
    explore: Explore;
    sqlBuilder: WarehouseSqlBuilder;
    timezone: string;
    now: Date;
};

/**
 * Builds retention as an Activity Schema query. The cohort is the born
 * activity, first ever or first per bucket for recurring cohorts. The return
 * activity is appended with an "all after" relationship, then bucketed into
 * periods and counted per cohort.
 */
export const generateRetentionSql = ({
    request,
    explore,
    sqlBuilder,
    timezone,
    now,
}: GenerateRetentionSqlArgs): string => {
    validateRetentionRequest(request);

    const stream = resolveActivityStream({
        explore,
        mapping: request,
        sqlBuilder,
        timezone,
    });
    const query = new ActivityStreamQuery(stream, sqlBuilder);
    const col = (name: string) => query.col(name);

    const { unit, periods, criteria, mode, cohortType } = request;
    const { start, end } = resolveEventAnalyticsDateRange(
        request.dateRange,
        now,
    );
    const startSql = sqlBuilder.castToTimestamp(start);
    const endSql = sqlBuilder.castToTimestamp(end);
    // Returns can land up to `periods + 1` buckets after the last birth.
    const scanEndSql = `${endSql} + ${sqlBuilder.getIntervalSql(
        periods + 1,
        UNIT_INTERVAL[unit],
    )}`;

    const bd = query.hasBreakdown ? col(ACTIVITY_COLUMNS.breakdown) : null;
    const bdGroup = bd ? `, ${bd}` : '';
    const bdSelect = (alias: string) => (bd ? `, ${alias}.${bd}` : '');
    const customer = col(ACTIVITY_COLUMNS.customer);
    const periodStart = col('period_start');
    const cohortColumns = [
        ACTIVITY_COLUMNS.customer,
        'period_start',
        ...(query.hasBreakdown ? [ACTIVITY_COLUMNS.breakdown] : []),
    ];

    const diff = (startTs: string, endTs: string) =>
        sqlBuilder.getTimestampDiffSeconds(startTs, endTs);
    let periodSql: string;
    if (mode === 'rolling') {
        periodSql = `FLOOR(${diff(
            `c.${col('birth_ts')}`,
            `s.${col(ACTIVITY_COLUMNS.ts)}`,
        )} / ${UNIT_SECONDS[unit]})`;
    } else if (unit === 'month') {
        periodSql = `(EXTRACT(YEAR FROM s.${periodStart}) - EXTRACT(YEAR FROM c.${periodStart})) * 12 + (EXTRACT(MONTH FROM s.${periodStart}) - EXTRACT(MONTH FROM c.${periodStart}))`;
    } else {
        // Both sides are bucket starts, so the difference is a whole number of units.
        periodSql = `ROUND(${diff(
            `c.${periodStart}`,
            `s.${periodStart}`,
        )} / ${UNIT_SECONDS[unit]})`;
    }

    const ctes: Record<string, string> = {
        stream: query.streamCte({
            activities: request.returnEvent
                ? [request.bornEvent, request.returnEvent]
                : null,
            tsFrom: startSql,
            tsTo: scanEndSql,
            // First-time cohorts need every born event to find each customer's first one.
            activitiesWithFullHistory:
                cohortType === 'first_time' ? [request.bornEvent] : [],
            extraColumns: {
                period_start: (tsSql) =>
                    getSqlForTruncatedDate(
                        sqlBuilder.getAdapterType(),
                        UNIT_TIME_FRAME[unit],
                        tsSql,
                        DimensionType.TIMESTAMP,
                        sqlBuilder.getStartOfWeek(),
                    ),
            },
        }),
        births: query.cohortCte({
            streamCte: 'stream',
            activity: request.bornEvent,
            occurrence:
                cohortType === 'first_time'
                    ? 'first_in_window'
                    : 'first_in_bucket',
            bucketColumn: 'period_start',
            tsFrom: startSql,
            tsTo: endSql,
            tsAlias: 'birth_ts',
        }),
        returns: query.allAfterCte({
            cohortCte: 'births',
            cohortColumns,
            cohortTsColumn: 'birth_ts',
            streamCte: 'stream',
            activity: request.returnEvent,
            appendColumns: { period: periodSql },
        }),
    };

    if (criteria === 'on') {
        ctes.retained = `
    SELECT
        ${periodStart}${bdGroup},
        ${col('period')},
        COUNT(DISTINCT ${customer}) AS ${col('users')}
    FROM returns
    WHERE ${col('period')} >= 0 AND ${col('period')} <= ${periods}
    GROUP BY ${periodStart}${bdGroup}, ${col('period')}`;
    } else {
        // Groups customers by their last period. Earlier periods are accumulated after the query.
        ctes.customer_last_period = `
    SELECT
        ${periodStart}${bdGroup},
        ${customer},
        CASE WHEN MAX(${col('period')}) > ${periods} THEN ${periods} ELSE MAX(${col(
            'period',
        )}) END AS ${col('period')}
    FROM returns
    WHERE ${col('period')} >= 0
    GROUP BY ${periodStart}${bdGroup}, ${customer}`;
        ctes.retained = `
    SELECT
        ${periodStart}${bdGroup},
        ${col('period')},
        COUNT(DISTINCT ${customer}) AS ${col('users')}
    FROM customer_last_period
    GROUP BY ${periodStart}${bdGroup}, ${col('period')}`;
    }

    ctes.cohorts = `
    SELECT
        ${periodStart}${bdGroup},
        COUNT(DISTINCT ${customer}) AS ${col('cohort_size')}
    FROM births
    GROUP BY ${periodStart}${bdGroup}`;

    const breakdownJoin = bd
        ? ` AND ${sqlBuilder.getNullSafeEqualJoinSql(`r.${bd}`, `c.${bd}`)}`
        : '';

    return ActivityStreamQuery.render(
        ctes,
        `SELECT
    c.${periodStart} AS ${col('cohort_date')}${bdSelect('c')},
    c.${col('cohort_size')},
    r.${col('period')},
    r.${col('users')}
FROM cohorts c
LEFT JOIN retained r
  ON r.${periodStart} = c.${periodStart}${breakdownJoin}
ORDER BY c.${periodStart}${bdSelect('c')}, r.${col('period')}`,
    );
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Normalizes a warehouse cohort bucket, a Date or a string, to yyyy-mm-dd. */
export const toCohortDateString = (value: unknown): string => {
    if (value instanceof Date) {
        // Warehouse drivers parse zoneless timestamps as local time.
        return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(
            value.getDate(),
        )}`;
    }
    if (typeof value === 'string') {
        return value.slice(0, 10);
    }
    if (value !== null && typeof value === 'object' && 'value' in value) {
        // BigQuery wraps DATE and TIMESTAMP values.
        return String((value as { value: unknown }).value).slice(0, 10);
    }
    throw new ParameterError(`Unexpected cohort date value: ${String(value)}`);
};

type RetentionRow = Record<string, unknown>;

/** Turns the long (cohort, period, users) rows into the cohort matrix. */
export const parseRetentionRows = (
    rows: RetentionRow[],
    request: Pick<
        RetentionQueryRequest,
        'unit' | 'periods' | 'criteria' | 'mode'
    >,
    now: Date,
): Pick<RetentionQueryResult, 'cohorts' | 'averages'> => {
    const { unit, periods, criteria, mode } = request;
    const cohorts = new Map<string, RetentionCohortResult>();

    rows.forEach((row) => {
        const cohortDate = toCohortDateString(row.cohort_date);
        const breakdownValue =
            row.breakdown_value === undefined || row.breakdown_value === null
                ? null
                : String(row.breakdown_value);
        const key = `${cohortDate}|${breakdownValue ?? ''}`;
        let cohort = cohorts.get(key);
        if (!cohort) {
            cohort = {
                cohortDate,
                breakdownValue,
                cohortSize: Number(row.cohort_size),
                counts: Array<number>(periods + 1).fill(0),
                rates: Array<number>(periods + 1).fill(0),
                lastCompletePeriod: getLastCompleteRetentionPeriod(
                    new Date(`${cohortDate}T00:00:00Z`),
                    unit,
                    mode,
                    periods,
                    now,
                ),
            };
            cohorts.set(key, cohort);
        }
        if (row.period !== null && row.period !== undefined) {
            const period = Number(row.period);
            if (period >= 0 && period <= periods) {
                cohort.counts[period] += Number(row.users);
            }
        }
    });

    const results = [...cohorts.values()].map((cohort) => {
        const counts = [...cohort.counts];
        if (criteria === 'on_or_after') {
            // SQL grouped users by their last period; a user retained in
            // period N also counts for every earlier period.
            for (let p = periods - 1; p >= 0; p -= 1) {
                counts[p] += counts[p + 1];
            }
        }
        const rates = counts.map((c) =>
            cohort.cohortSize > 0 ? (c * 100) / cohort.cohortSize : 0,
        );
        return { ...cohort, counts, rates };
    });

    return {
        cohorts: results,
        averages: computeRetentionAverages(results, periods),
    };
};
