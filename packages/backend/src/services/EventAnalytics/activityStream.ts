import {
    DimensionType,
    getFieldMap,
    type EventAnalyticsQueryBase,
    type Explore,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import {
    compileEventAnalyticsFilterSql,
    getBaseTableFromSql,
    getDimensionFromFieldMap,
    quoteStringLiteral,
} from './eventAnalyticsSql';

/**
 * An explore viewed as an Activity Schema stream (activityschema.com): one
 * row per activity with a customer, an activity name, and a timestamp.
 * Funnel and retention queries compile against this instead of raw explore
 * fields.
 */
export type ActivityStream = {
    fromSql: string;
    customerSql: string;
    activitySql: string;
    /** A timestamp-typed expression. */
    tsSql: string;
    breakdownSql: string | null;
    /** The compiled semantic-layer dimension filters. */
    filterSql: string | null;
};

type ResolveActivityStreamArgs = {
    explore: Explore;
    mapping: EventAnalyticsQueryBase;
    sqlBuilder: WarehouseSqlBuilder;
    timezone: string;
};

/** Maps an explore onto the activity stream contract using the request's field mapping. */
export const resolveActivityStream = ({
    explore,
    mapping,
    sqlBuilder,
    timezone,
}: ResolveActivityStreamArgs): ActivityStream => {
    const fieldMap = getFieldMap(explore);
    const timestampField = getDimensionFromFieldMap(
        fieldMap,
        mapping.timestampFieldId,
    );
    const customerField = getDimensionFromFieldMap(
        fieldMap,
        mapping.userIdFieldId,
    );
    const activityField = getDimensionFromFieldMap(
        fieldMap,
        mapping.eventNameFieldId,
    );
    const breakdownField = mapping.breakdownDimensionId
        ? getDimensionFromFieldMap(fieldMap, mapping.breakdownDimensionId)
        : null;

    return {
        fromSql: getBaseTableFromSql(explore, sqlBuilder),
        customerSql: customerField.compiledSql,
        activitySql: activityField.compiledSql,
        tsSql:
            timestampField.type === DimensionType.DATE
                ? `CAST(${timestampField.compiledSql} AS TIMESTAMP)`
                : timestampField.compiledSql,
        breakdownSql: breakdownField?.compiledSql ?? null,
        filterSql: compileEventAnalyticsFilterSql({
            filters: mapping.filters,
            explore,
            sqlBuilder,
            timezone,
        }),
    };
};

/** Column names used inside the generated CTEs. */
export const ACTIVITY_COLUMNS = {
    customer: 'customer',
    activity: 'activity',
    ts: 'ts',
    breakdown: 'breakdown_value',
} as const;

type StreamCteArgs = {
    /** The activities to keep. Null keeps every activity. */
    activities: string[] | null;
    /** The timestamp bounds, as SQL expressions. */
    tsFrom: string | null;
    tsTo: string | null;
    /** Activities that ignore `tsFrom`, so their whole history is kept. */
    activitiesWithFullHistory?: string[];
    /** Extra columns computed from the timestamp expression. */
    extraColumns?: Record<string, (tsSql: string) => string>;
};

export type CohortOccurrence =
    /** The customer's first row of the activity within the stream window. */
    | 'first_in_window'
    /** The customer's first row of the activity in each bucket. */
    | 'first_in_bucket';

type CohortCteArgs = {
    streamCte: string;
    activity: string;
    occurrence: CohortOccurrence;
    /** The stream CTE column used as the bucket. Required for `first_in_bucket`. */
    bucketColumn?: string;
    /** Extra bounds on the cohort row timestamp. */
    tsFrom: string | null;
    tsTo: string | null;
    /** The alias of the cohort timestamp column. */
    tsAlias: string;
};

type AppendCteArgs = {
    cohortCte: string;
    /** The columns carried over from the cohort CTE. */
    cohortColumns: string[];
    cohortTsColumn: string;
    streamCte: string;
    /** The activity to append. Null means any activity. */
    activity: string | null;
    /** If set, ignores rows later than this interval after the cohort timestamp. */
    maxInterval?: string | null;
};

/**
 * Builds the CTE bodies of Activity Schema style temporal queries: a
 * normalized stream, cohort rows, and "first after" or "all after" appends
 * joined on customer and timestamp only.
 */
export class ActivityStreamQuery {
    private readonly stream: ActivityStream;

    private readonly sqlBuilder: WarehouseSqlBuilder;

    constructor(stream: ActivityStream, sqlBuilder: WarehouseSqlBuilder) {
        this.stream = stream;
        this.sqlBuilder = sqlBuilder;
    }

    col(name: string): string {
        const q = this.sqlBuilder.getFieldQuoteChar();
        return `${q}${name}${q}`;
    }

    literal(value: string): string {
        return quoteStringLiteral(this.sqlBuilder, value);
    }

    get hasBreakdown(): boolean {
        return this.stream.breakdownSql !== null;
    }

    /** The columns every cohort row carries besides its timestamp. */
    get cohortBaseColumns(): string[] {
        return this.hasBreakdown
            ? [ACTIVITY_COLUMNS.customer, ACTIVITY_COLUMNS.breakdown]
            : [ACTIVITY_COLUMNS.customer];
    }

    streamCte({
        activities,
        tsFrom,
        tsTo,
        activitiesWithFullHistory = [],
        extraColumns = {},
    }: StreamCteArgs): string {
        const { stream } = this;
        const predicates: string[] = [`${stream.customerSql} IS NOT NULL`];

        if (tsFrom) {
            const history = activitiesWithFullHistory.map((a) =>
                this.literal(a),
            );
            predicates.push(
                history.length > 0
                    ? `(${stream.tsSql} >= ${tsFrom} OR ${
                          stream.activitySql
                      } IN (${history.join(', ')}))`
                    : `${stream.tsSql} >= ${tsFrom}`,
            );
        }
        if (tsTo) predicates.push(`${stream.tsSql} < ${tsTo}`);
        if (activities) {
            const unique = [...new Set(activities)].map((a) => this.literal(a));
            predicates.push(
                unique.length === 1
                    ? `${stream.activitySql} = ${unique[0]}`
                    : `${stream.activitySql} IN (${unique.join(', ')})`,
            );
        }
        if (stream.filterSql) predicates.push(stream.filterSql);

        const selects = [
            `${stream.customerSql} AS ${this.col(ACTIVITY_COLUMNS.customer)}`,
            `${stream.activitySql} AS ${this.col(ACTIVITY_COLUMNS.activity)}`,
            `${stream.tsSql} AS ${this.col(ACTIVITY_COLUMNS.ts)}`,
            ...Object.entries(extraColumns).map(
                ([name, build]) =>
                    `${build(stream.tsSql)} AS ${this.col(name)}`,
            ),
            ...(stream.breakdownSql
                ? [
                      `${stream.breakdownSql} AS ${this.col(
                          ACTIVITY_COLUMNS.breakdown,
                      )}`,
                  ]
                : []),
        ];

        return `
    SELECT
        ${selects.join(',\n        ')}
    FROM ${stream.fromSql}
    WHERE ${predicates.join('\n      AND ')}`;
    }

    cohortCte({
        streamCte,
        activity,
        occurrence,
        bucketColumn,
        tsFrom,
        tsTo,
        tsAlias,
    }: CohortCteArgs): string {
        if (occurrence === 'first_in_bucket' && !bucketColumn) {
            throw new Error('first_in_bucket cohorts need a bucket column');
        }
        const partition = [
            this.col(ACTIVITY_COLUMNS.customer),
            ...(occurrence === 'first_in_bucket' && bucketColumn
                ? [this.col(bucketColumn)]
                : []),
        ];
        const carried = [
            ...(bucketColumn ? [bucketColumn] : []),
            ...(this.hasBreakdown ? [ACTIVITY_COLUMNS.breakdown] : []),
        ];
        const carriedSql = carried.map((c) => `, ${this.col(c)}`).join('');
        const ts = this.col(ACTIVITY_COLUMNS.ts);
        const bounds = [
            ...(tsFrom ? [`${ts} >= ${tsFrom}`] : []),
            ...(tsTo ? [`${ts} < ${tsTo}`] : []),
        ];

        return `
    SELECT
        ${this.col(ACTIVITY_COLUMNS.customer)},
        ${ts} AS ${this.col(tsAlias)}${carriedSql}
    FROM (
        SELECT
            ${this.col(ACTIVITY_COLUMNS.customer)},
            ${ts}${carriedSql},
            ROW_NUMBER() OVER (
                PARTITION BY ${partition.join(', ')}
                ORDER BY ${ts}
            ) AS ${this.col('occurrence')}
        FROM ${streamCte}
        WHERE ${this.col(ACTIVITY_COLUMNS.activity)} = ${this.literal(activity)}
    ) occurrences
    WHERE ${[`${this.col('occurrence')} = 1`, ...bounds].join('\n      AND ')}`;
    }

    private appendJoin({
        cohortTsColumn,
        streamCte,
        activity,
        maxInterval,
    }: Omit<AppendCteArgs, 'cohortCte' | 'cohortColumns'>): string {
        const c = (name: string) => `c.${this.col(name)}`;
        const s = (name: string) => `s.${this.col(name)}`;
        const conditions = [
            `${s(ACTIVITY_COLUMNS.customer)} = ${c(ACTIVITY_COLUMNS.customer)}`,
            `${s(ACTIVITY_COLUMNS.ts)} > ${c(cohortTsColumn)}`,
            ...(activity !== null
                ? [
                      `${s(ACTIVITY_COLUMNS.activity)} = ${this.literal(activity)}`,
                  ]
                : []),
            ...(maxInterval
                ? [
                      `${s(ACTIVITY_COLUMNS.ts)} <= ${c(cohortTsColumn)} + ${maxInterval}`,
                  ]
                : []),
        ];
        return `JOIN ${streamCte} s
      ON ${conditions.join('\n     AND ')}`;
    }

    /** Appends the first matching activity after each cohort row, as `appendTsAlias`. */
    firstAfterCte(args: AppendCteArgs & { appendTsAlias: string }): string {
        const cohortSelect = args.cohortColumns
            .map((name) => `c.${this.col(name)}`)
            .join(',\n        ');
        return `
    SELECT
        ${cohortSelect},
        MIN(s.${this.col(ACTIVITY_COLUMNS.ts)}) AS ${this.col(
            args.appendTsAlias,
        )}
    FROM ${args.cohortCte} c
    ${this.appendJoin(args)}
    GROUP BY ${cohortSelect}`;
    }

    /** Appends every matching activity after each cohort row, one row per occurrence. */
    allAfterCte(
        args: AppendCteArgs & {
            /** Columns computed from the append row. `c` is the cohort row and `s` the stream row. */
            appendColumns: Record<string, string>;
        },
    ): string {
        const cohortSelect = args.cohortColumns
            .map((name) => `c.${this.col(name)}`)
            .join(',\n        ');
        const appendSelect = Object.entries(args.appendColumns)
            .map(([name, sql]) => `${sql} AS ${this.col(name)}`)
            .join(',\n        ');
        return `
    SELECT
        ${cohortSelect},
        ${appendSelect}
    FROM ${args.cohortCte} c
    ${this.appendJoin(args)}`;
    }

    /** Renders named CTEs and a final select into one statement. */
    static render(ctes: Record<string, string>, finalSql: string): string {
        const body = Object.entries(ctes)
            .map(([name, sql]) => `${name} AS (${sql}\n)`)
            .join(',\n');
        return `\nWITH ${body}\n${finalSql}\n`;
    }
}
