import {
    assertUnreachable,
    DimensionType,
    ParameterError,
    SupportedDbtAdapter,
    TimeFrames,
    type MergeFieldMeta,
} from '@lightdash/common';

/**
 * The date-spine fill of a merged result: one row per grain step between the
 * merged result's first and last join-key value. It changes the row set, so
 * it belongs to the composable core — an IR node the builder joins against —
 * never to the terminal wrapper.
 */
export type MergeDateSpine = {
    /** The single temporal join key column the spine replaces, pre-alias. */
    keyName: string;
    grain: TimeFrames;
    keyMeta: MergeFieldMeta;
};

/**
 * Whether a dialect can generate the spine natively. Redshift cannot —
 * `generate_series` is leader-node-only there — and undialected adapters stay
 * non-capable until researched; the selection function routes their fills to
 * the DuckDB engine, or refuses by name when it cannot.
 */
export const canFillMissingDatesOnAdapter = (
    adapterType: SupportedDbtAdapter,
): boolean => {
    switch (adapterType) {
        case SupportedDbtAdapter.POSTGRES:
        case SupportedDbtAdapter.BIGQUERY:
        case SupportedDbtAdapter.SNOWFLAKE:
        case SupportedDbtAdapter.DATABRICKS:
        case SupportedDbtAdapter.SPARK:
        case SupportedDbtAdapter.TRINO:
        case SupportedDbtAdapter.DUCKDB:
            return true;
        case SupportedDbtAdapter.REDSHIFT:
        case SupportedDbtAdapter.CLICKHOUSE:
        case SupportedDbtAdapter.ATHENA:
            return false;
        default:
            return assertUnreachable(adapterType, 'Unknown adapter type');
    }
};

/** Grain steps the spine supports; anything finer is refused by name. */
const SPINE_GRAINS: ReadonlySet<TimeFrames> = new Set([
    TimeFrames.YEAR,
    TimeFrames.QUARTER,
    TimeFrames.MONTH,
    TimeFrames.WEEK,
    TimeFrames.DAY,
    TimeFrames.HOUR,
]);

const assertSpineGrain = (grain: TimeFrames): void => {
    if (!SPINE_GRAINS.has(grain)) {
        throw new ParameterError(
            `Filling missing dates is not supported at the ${grain} grain.`,
        );
    }
};

/**
 * Snowflake's GENERATOR takes only constant rowcounts, so the spine
 * over-generates to a per-grain cap and filters by the max bound. The caps
 * bound the spine, not the data: ~11 years of hours, ~136 years of days.
 */
const SNOWFLAKE_HOUR_CAP = 100_000;
const SNOWFLAKE_DAY_CAP = 50_000;

/**
 * BigQuery routes by key type: there is no DATETIME generator and the
 * timestamp generator tops out at DAY steps, so coarse grains go through the
 * date array and convert back — with an explicit UTC zone, since keys at
 * those grains are truncated to midnight UTC of period starts.
 */
const getBigqueryDateSpineSql = ({
    key,
    grain,
    keyMeta,
    minBound,
    maxBound,
}: {
    key: string;
    grain: TimeFrames;
    keyMeta: MergeFieldMeta;
    minBound: string;
    maxBound: string;
}): string => {
    const dateStepByGrain: Record<string, string> = {
        [TimeFrames.YEAR]: 'INTERVAL 1 YEAR',
        [TimeFrames.QUARTER]: 'INTERVAL 1 QUARTER',
        [TimeFrames.MONTH]: 'INTERVAL 1 MONTH',
        [TimeFrames.WEEK]: 'INTERVAL 7 DAY',
        [TimeFrames.DAY]: 'INTERVAL 1 DAY',
    };
    const dateArray = (min: string, max: string) =>
        `GENERATE_DATE_ARRAY(\n    ${min},\n    ${max},\n    ${dateStepByGrain[grain]}\n)`;

    if (keyMeta.type === DimensionType.DATE) {
        if (grain === TimeFrames.HOUR) {
            throw new ParameterError(
                'Filling missing dates at the hour grain needs a timestamp join key.',
            );
        }
        return `SELECT d AS ${key}\nFROM UNNEST(${dateArray(minBound, maxBound)}) AS d`;
    }

    const isNaive = keyMeta.timestampDomain === 'naive';
    const fineGrain =
        grain === TimeFrames.HOUR ||
        grain === TimeFrames.DAY ||
        grain === TimeFrames.WEEK;
    if (fineGrain) {
        const step =
            grain === TimeFrames.HOUR
                ? 'INTERVAL 1 HOUR'
                : dateStepByGrain[grain];
        const timestampArray = (min: string, max: string) =>
            `GENERATE_TIMESTAMP_ARRAY(\n    ${min},\n    ${max},\n    ${step}\n)`;
        if (isNaive) {
            // DATETIME keys round-trip through TIMESTAMP with an explicit
            // zone so the conversion is exact regardless of session settings.
            return `SELECT DATETIME(ts, 'UTC') AS ${key}\nFROM UNNEST(${timestampArray(
                `TIMESTAMP(${minBound}, 'UTC')`,
                `TIMESTAMP(${maxBound}, 'UTC')`,
            )}) AS ts`;
        }
        return `SELECT ts AS ${key}\nFROM UNNEST(${timestampArray(minBound, maxBound)}) AS ts`;
    }

    // MONTH and coarser on a temporal key: no timestamp generator supports
    // these steps, so route through the date array. Safe because keys at
    // these grains are truncated to period starts.
    const convert = isNaive ? `DATETIME(d)` : `TIMESTAMP(d, 'UTC')`;
    return `SELECT ${convert} AS ${key}\nFROM UNNEST(${dateArray(
        `DATE(${minBound})`,
        `DATE(${maxBound})`,
    )}) AS d`;
};

type SpineSqlArgs = {
    adapterType: SupportedDbtAdapter;
    /** Identifier quoting, from the builder's dialect. */
    quote: (identifier: string) => string;
    /** CTE holding the merged rows the spine spans. */
    mergedCteName: string;
    spine: MergeDateSpine;
};

/**
 * The spine CTE body: a single column named after the join key, one row per
 * grain step from the merged result's min key to its max, generated with the
 * dialect's own construct. Bounds are scalar subqueries in every dialect —
 * only Snowflake needs the over-generate-and-filter workaround. No ORDER BY:
 * ordering is the terminal wrapper's job.
 */
export const getMergeDateSpineSql = ({
    adapterType,
    quote,
    mergedCteName,
    spine,
}: SpineSqlArgs): string => {
    const { grain, keyMeta } = spine;
    assertSpineGrain(grain);
    const key = quote(spine.keyName);
    const minBound = `(SELECT MIN(${key}) FROM ${mergedCteName})`;
    const maxBound = `(SELECT MAX(${key}) FROM ${mergedCteName})`;

    switch (adapterType) {
        case SupportedDbtAdapter.POSTGRES:
        case SupportedDbtAdapter.DUCKDB: {
            const stepByGrain: Record<string, string> = {
                [TimeFrames.YEAR]: '1 year',
                [TimeFrames.QUARTER]: '3 months',
                [TimeFrames.MONTH]: '1 month',
                [TimeFrames.WEEK]: '7 days',
                [TimeFrames.DAY]: '1 day',
                [TimeFrames.HOUR]: '1 hour',
            };
            const series = `generate_series(\n    ${minBound},\n    ${maxBound},\n    INTERVAL '${stepByGrain[grain]}'\n)`;
            if (adapterType === SupportedDbtAdapter.DUCKDB) {
                // DuckDB's series is array-valued; unnest it. No cast: the
                // engine reads temporal keys back as timestamps regardless of
                // the declared type.
                return `SELECT unnest(${series}) AS ${key}`;
            }
            // Postgres resolves date bounds to timestamptz; cast back so the
            // join compares date with date and the key keeps its type.
            const cast = keyMeta.type === DimensionType.DATE ? '::date' : '';
            return `SELECT ${series}${cast} AS ${key}`;
        }
        case SupportedDbtAdapter.BIGQUERY: {
            return getBigqueryDateSpineSql({
                key,
                grain,
                keyMeta,
                minBound,
                maxBound,
            });
        }
        case SupportedDbtAdapter.SNOWFLAKE: {
            const offset = 'ROW_NUMBER() OVER (ORDER BY SEQ4()) - 1';
            const stepByGrain: Record<string, string> = {
                [TimeFrames.YEAR]: `DATEADD(year, ${offset}, ${minBound})`,
                [TimeFrames.QUARTER]: `DATEADD(month, 3 * (${offset}), ${minBound})`,
                [TimeFrames.MONTH]: `DATEADD(month, ${offset}, ${minBound})`,
                [TimeFrames.WEEK]: `DATEADD(day, 7 * (${offset}), ${minBound})`,
                [TimeFrames.DAY]: `DATEADD(day, ${offset}, ${minBound})`,
                [TimeFrames.HOUR]: `DATEADD(hour, ${offset}, ${minBound})`,
            };
            const cap =
                grain === TimeFrames.HOUR
                    ? SNOWFLAKE_HOUR_CAP
                    : SNOWFLAKE_DAY_CAP;
            return [
                `SELECT ${stepByGrain[grain]} AS ${key}`,
                `FROM TABLE(GENERATOR(ROWCOUNT => ${cap}))`,
                `QUALIFY ${key} <= ${maxBound}`,
            ].join('\n');
        }
        case SupportedDbtAdapter.DATABRICKS:
        case SupportedDbtAdapter.SPARK:
        case SupportedDbtAdapter.TRINO: {
            const stepByGrain: Record<string, string> = {
                [TimeFrames.YEAR]: `INTERVAL '1' YEAR`,
                [TimeFrames.QUARTER]: `INTERVAL '3' MONTH`,
                [TimeFrames.MONTH]: `INTERVAL '1' MONTH`,
                [TimeFrames.WEEK]: `INTERVAL '7' DAY`,
                [TimeFrames.DAY]: `INTERVAL '1' DAY`,
                // Trino caps sequence at 10,000 elements, so an HOUR fill
                // beyond ~13 months errors by name instead of returning
                // wrong data.
                [TimeFrames.HOUR]: `INTERVAL '1' HOUR`,
            };
            const sequence = `sequence(\n    ${minBound},\n    ${maxBound},\n    ${stepByGrain[grain]}\n)`;
            if (adapterType === SupportedDbtAdapter.TRINO) {
                return `SELECT s AS ${key}\nFROM UNNEST(${sequence}) AS t (s)`;
            }
            return `SELECT explode(${sequence}) AS ${key}`;
        }
        case SupportedDbtAdapter.REDSHIFT:
        case SupportedDbtAdapter.CLICKHOUSE:
        case SupportedDbtAdapter.ATHENA:
            throw new ParameterError(
                `Filling missing dates is not supported on ${adapterType}. Remove the date fill or use the DuckDB engine.`,
            );
        default:
            return assertUnreachable(adapterType, 'Unknown adapter type');
    }
};
