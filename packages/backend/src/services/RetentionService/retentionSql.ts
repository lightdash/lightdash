import {
    computeRetentionAverages,
    DimensionType,
    getFieldMap,
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
    compileEventAnalyticsFilterSql,
    getBaseTableFromSql,
    getDimensionFromFieldMap,
    quoteStringLiteral,
} from '../EventAnalytics/eventAnalyticsSql';

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

// Rolling periods are fixed lengths from the birth event; a rolling month is 30 days
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

export const generateRetentionSql = ({
    request,
    explore,
    sqlBuilder,
    timezone,
    now,
}: GenerateRetentionSqlArgs): string => {
    validateRetentionRequest(request);

    const q = sqlBuilder.getFieldQuoteChar();
    const col = (name: string) => `${q}${name}${q}`;
    const fieldMap = getFieldMap(explore);

    const timestampField = getDimensionFromFieldMap(
        fieldMap,
        request.timestampFieldId,
    );
    const userIdField = getDimensionFromFieldMap(
        fieldMap,
        request.userIdFieldId,
    );
    const eventNameField = getDimensionFromFieldMap(
        fieldMap,
        request.eventNameFieldId,
    );
    const breakdownField = request.breakdownDimensionId
        ? getDimensionFromFieldMap(fieldMap, request.breakdownDimensionId)
        : null;

    const { unit, periods, criteria, mode, cohortType } = request;
    const { start, end } = resolveEventAnalyticsDateRange(
        request.dateRange,
        now,
    );
    const startSql = sqlBuilder.castToTimestamp(start);
    const endSql = sqlBuilder.castToTimestamp(end);
    // Returns can land up to `periods + 1` buckets after the last birth
    const scanEndSql = `${endSql} + ${sqlBuilder.getIntervalSql(
        periods + 1,
        UNIT_INTERVAL[unit],
    )}`;

    const bornSql = quoteStringLiteral(sqlBuilder, request.bornEvent);
    const returnSql = request.returnEvent
        ? quoteStringLiteral(sqlBuilder, request.returnEvent)
        : null;

    const tsSql = timestampField.compiledSql;
    const eventTimestampSql =
        timestampField.type === DimensionType.DATE
            ? `CAST(${tsSql} AS TIMESTAMP)`
            : tsSql;
    const periodStartSql = getSqlForTruncatedDate(
        sqlBuilder.getAdapterType(),
        UNIT_TIME_FRAME[unit],
        eventTimestampSql,
        DimensionType.TIMESTAMP,
        sqlBuilder.getStartOfWeek(),
    );

    const eventPredicate = returnSql
        ? `${eventNameField.compiledSql} IN (${bornSql}, ${returnSql})`
        : null;
    // First-time cohorts need every born event to find each user's first one;
    // recurring cohorts only need events inside the cohort window.
    const windowPredicate =
        cohortType === 'first_time'
            ? `${tsSql} < ${scanEndSql} AND (${eventNameField.compiledSql} = ${bornSql} OR ${tsSql} >= ${startSql})`
            : `${tsSql} >= ${startSql} AND ${tsSql} < ${scanEndSql}`;
    const filterSql = compileEventAnalyticsFilterSql({
        filters: request.filters,
        explore,
        sqlBuilder,
        timezone,
    });
    const wherePredicates = [
        `${userIdField.compiledSql} IS NOT NULL`,
        windowPredicate,
        eventPredicate,
        filterSql,
    ].filter((p): p is string => p !== null);

    const bd = breakdownField ? col('breakdown_value') : null;
    const bdSelect = (alias: string) => (bd ? `, ${alias}.${bd}` : '');
    const bdGroup = bd ? `, ${bd}` : '';

    const diff = (startTs: string, endTs: string) =>
        sqlBuilder.getTimestampDiffSeconds(startTs, endTs);
    let periodSql: string;
    if (mode === 'rolling') {
        periodSql = `FLOOR(${diff(
            `b.${col('birth_time')}`,
            `e.${col('event_timestamp')}`,
        )} / ${UNIT_SECONDS[unit]})`;
    } else if (unit === 'month') {
        periodSql = `(EXTRACT(YEAR FROM e.${col(
            'period_start',
        )}) - EXTRACT(YEAR FROM b.${col(
            'cohort_date',
        )})) * 12 + (EXTRACT(MONTH FROM e.${col(
            'period_start',
        )}) - EXTRACT(MONTH FROM b.${col('cohort_date')}))`;
    } else {
        // Both sides are bucket starts, so the difference is a whole number of units
        periodSql = `ROUND(${diff(
            `b.${col('cohort_date')}`,
            `e.${col('period_start')}`,
        )} / ${UNIT_SECONDS[unit]})`;
    }

    const retainedCte =
        criteria === 'on'
            ? `
retained AS (
    SELECT
        ${col('cohort_date')}${bdGroup},
        ${col('period')},
        COUNT(DISTINCT ${col('user_id')}) AS ${col('users')}
    FROM returns
    WHERE ${col('period')} >= 0 AND ${col('period')} <= ${periods}
    GROUP BY ${col('cohort_date')}${bdGroup}, ${col('period')}
)`
            : `
user_last_period AS (
    SELECT
        ${col('cohort_date')}${bdGroup},
        ${col('user_id')},
        CASE WHEN MAX(${col('period')}) > ${periods} THEN ${periods} ELSE MAX(${col(
            'period',
        )}) END AS ${col('period')}
    FROM returns
    WHERE ${col('period')} >= 0
    GROUP BY ${col('cohort_date')}${bdGroup}, ${col('user_id')}
),
retained AS (
    SELECT
        ${col('cohort_date')}${bdGroup},
        ${col('period')},
        COUNT(DISTINCT ${col('user_id')}) AS ${col('users')}
    FROM user_last_period
    GROUP BY ${col('cohort_date')}${bdGroup}, ${col('period')}
)`;

    const breakdownJoin = bd
        ? ` AND ${sqlBuilder.getNullSafeEqualJoinSql(`r.${bd}`, `c.${bd}`)}`
        : '';

    return `
WITH events AS (
    SELECT
        ${userIdField.compiledSql} AS ${col('user_id')},
        ${eventNameField.compiledSql} AS ${col('event_name')},
        ${eventTimestampSql} AS ${col('event_timestamp')},
        ${periodStartSql} AS ${col('period_start')}${
            breakdownField
                ? `,\n        ${breakdownField.compiledSql} AS ${bd}`
                : ''
        }
    FROM ${getBaseTableFromSql(explore, sqlBuilder)}
    WHERE ${wherePredicates.join('\n      AND ')}
),
born_events AS (
    SELECT
        ${col('user_id')},
        ${col('event_timestamp')},
        ${col('period_start')}${bdGroup},
        ROW_NUMBER() OVER (
            PARTITION BY ${col('user_id')}${
                cohortType === 'recurring' ? `, ${col('period_start')}` : ''
            }
            ORDER BY ${col('event_timestamp')}
        ) AS ${col('rn')}
    FROM events
    WHERE ${col('event_name')} = ${bornSql}
),
births AS (
    SELECT
        ${col('user_id')},
        ${col('event_timestamp')} AS ${col('birth_time')},
        ${col('period_start')} AS ${col('cohort_date')}${bdGroup}
    FROM born_events
    WHERE ${col('rn')} = 1
      AND ${col('event_timestamp')} >= ${startSql}
      AND ${col('event_timestamp')} < ${endSql}
),
returns AS (
    SELECT
        b.${col('user_id')},
        b.${col('cohort_date')}${bdSelect('b')},
        ${periodSql} AS ${col('period')}
    FROM births b
    JOIN events e
      ON e.${col('user_id')} = b.${col('user_id')}
     AND e.${col('event_timestamp')} > b.${col('birth_time')}${
         returnSql ? `\n     AND e.${col('event_name')} = ${returnSql}` : ''
     }
),${retainedCte},
cohorts AS (
    SELECT
        ${col('cohort_date')}${bdGroup},
        COUNT(DISTINCT ${col('user_id')}) AS ${col('cohort_size')}
    FROM births
    GROUP BY ${col('cohort_date')}${bdGroup}
)
SELECT
    c.${col('cohort_date')}${bdSelect('c')},
    c.${col('cohort_size')},
    r.${col('period')},
    r.${col('users')}
FROM cohorts c
LEFT JOIN retained r
  ON r.${col('cohort_date')} = c.${col('cohort_date')}${breakdownJoin}
ORDER BY c.${col('cohort_date')}${bdSelect('c')}, r.${col('period')}
`;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Normalise a warehouse cohort bucket (Date or string) to yyyy-mm-dd. */
export const toCohortDateString = (value: unknown): string => {
    if (value instanceof Date) {
        // Warehouse drivers parse zoneless timestamps as local time
        return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(
            value.getDate(),
        )}`;
    }
    if (typeof value === 'string') {
        return value.slice(0, 10);
    }
    if (value !== null && typeof value === 'object' && 'value' in value) {
        // BigQuery wraps DATE/TIMESTAMP values
        return String((value as { value: unknown }).value).slice(0, 10);
    }
    throw new ParameterError(`Unexpected cohort date value: ${String(value)}`);
};

type RetentionRow = Record<string, unknown>;

/** Turn the long (cohort, period, users) rows into the cohort matrix. */
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
