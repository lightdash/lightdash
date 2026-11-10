import {
    resolveEventAnalyticsDateRange,
    TimeIntervalUnit,
    type Explore,
    type FunnelConversionWindowUnit,
    type FunnelQueryRequest,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import {
    ACTIVITY_COLUMNS,
    ActivityStreamQuery,
    resolveActivityStream,
} from './activityStream';

const CONVERSION_WINDOW_UNIT: Record<
    FunnelConversionWindowUnit,
    TimeIntervalUnit
> = {
    hours: TimeIntervalUnit.HOUR,
    days: TimeIntervalUnit.DAY,
    weeks: TimeIntervalUnit.WEEK,
};

type GenerateFunnelSqlArgs = {
    request: FunnelQueryRequest;
    explore: Explore;
    sqlBuilder: WarehouseSqlBuilder;
    timezone: string;
    now: Date;
};

/**
 * Builds a funnel as an Activity Schema query. Step 1 is the cohort, the
 * first occurrence in the date range. Every later step is a "first after"
 * append on the previous step within the conversion window.
 */
export const generateFunnelSql = ({
    request,
    explore,
    sqlBuilder,
    timezone,
    now,
}: GenerateFunnelSqlArgs): string => {
    const stream = resolveActivityStream({
        explore,
        mapping: request,
        sqlBuilder,
        timezone,
    });
    const query = new ActivityStreamQuery(stream, sqlBuilder);
    const col = (name: string) => query.col(name);

    const { start, end } = resolveEventAnalyticsDateRange(
        request.dateRange,
        now,
    );
    const startSql = sqlBuilder.castToTimestamp(start);
    const endSql = sqlBuilder.castToTimestamp(end);
    const windowInterval = request.conversionWindow
        ? sqlBuilder.getIntervalSql(
              request.conversionWindow.value,
              CONVERSION_WINDOW_UNIT[request.conversionWindow.unit],
          )
        : sqlBuilder.getIntervalSql(30, TimeIntervalUnit.DAY);

    const steps = [...request.steps].sort((a, b) => a.stepOrder - b.stepOrder);
    const stepTs = (idx: number) => `step_${idx + 1}_ts`;
    const bd = query.hasBreakdown ? col(ACTIVITY_COLUMNS.breakdown) : null;
    const customer = col(ACTIVITY_COLUMNS.customer);

    const ctes: Record<string, string> = {
        stream: query.streamCte({
            activities: steps.map((s) => s.eventName),
            tsFrom: startSql,
            tsTo: endSql,
        }),
    };

    steps.forEach((step, idx) => {
        const name = `step_${idx + 1}`;
        if (idx === 0) {
            ctes[name] = query.cohortCte({
                streamCte: 'stream',
                activity: step.eventName,
                occurrence: 'first_in_window',
                tsFrom: null,
                tsTo: null,
                tsAlias: stepTs(0),
            });
            return;
        }
        ctes[name] = query.firstAfterCte({
            cohortCte: `step_${idx}`,
            cohortColumns: [
                ...query.cohortBaseColumns,
                ...steps.slice(0, idx).map((_, i) => stepTs(i)),
            ],
            cohortTsColumn: stepTs(idx - 1),
            streamCte: 'stream',
            activity: step.eventName,
            maxInterval: windowInterval,
            appendTsAlias: stepTs(idx),
        });
    });

    const stepResults = steps.map((step, idx) => {
        const medianSql =
            idx > 0
                ? sqlBuilder.getMedianSql(
                      sqlBuilder.getTimestampDiffSeconds(
                          col(stepTs(idx - 1)),
                          col(stepTs(idx)),
                      ),
                  )
                : `CAST(NULL AS ${sqlBuilder.getFloatingType()})`;
        return `
    SELECT
        ${idx + 1} AS ${col('step_order')},
        ${query.literal(step.eventName)} AS ${col('step_name')},
        COUNT(DISTINCT ${customer}) AS ${col('total_users')},
        ${medianSql} AS ${col('median_time_to_convert')}${
            bd ? `,\n        ${bd}` : ''
        }
    FROM step_${idx + 1}${bd ? `\n    GROUP BY ${bd}` : ''}`;
    });
    ctes.funnel_results = stepResults.join('\n    UNION ALL');

    const partition = bd ? `PARTITION BY ${bd}` : '';
    const stepOrder = col('step_order');
    const totalUsers = col('total_users');
    const firstStepUsers = `FIRST_VALUE(${totalUsers}) OVER (${partition} ORDER BY ${stepOrder})`;
    const previousStepUsers = `LAG(${totalUsers}) OVER (${partition} ORDER BY ${stepOrder})`;

    return ActivityStreamQuery.render(
        ctes,
        `SELECT
    ${stepOrder},
    ${col('step_name')},
    ${totalUsers},
    ${col('median_time_to_convert')},
    CASE
        WHEN ${firstStepUsers} > 0
        THEN (${totalUsers} * 100.0) / ${firstStepUsers}
        ELSE 0
    END AS ${col('conversion_rate')},
    CASE
        WHEN ${stepOrder} = 1 THEN 100.0
        WHEN ${previousStepUsers} > 0
        THEN (${totalUsers} * 100.0) / ${previousStepUsers}
        ELSE 0
    END AS ${col('step_conversion_rate')}${bd ? `,\n    ${bd}` : ''}
FROM funnel_results
ORDER BY ${bd ? `${bd}, ` : ''}${stepOrder}`,
    );
};
