import { subject } from '@casl/ability';
import {
    type AdditionalMetric,
    CompiledDimension,
    CompiledField,
    Explore,
    ForbiddenError,
    FunnelConversionWindowUnit,
    FunnelQueryRequest,
    FunnelQueryResult,
    FunnelStep,
    FunnelStepResult,
    getFieldMap,
    isDimension,
    isExploreError,
    NotFoundError,
    resolveFunnelDateRange,
    SessionUser,
    TimeIntervalUnit,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import * as Sentry from '@sentry/node';
import type { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import type { LightdashConfig } from '../../config/parseConfig';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../BaseService';
import type { ProjectService } from '../ProjectService/ProjectService';

type FunnelServiceArguments = {
    analytics: LightdashAnalytics;
    lightdashConfig: LightdashConfig;
    projectModel: ProjectModel;
    projectService: ProjectService;
};

export class FunnelService extends BaseService {
    private static readonly conversionWindowUnitMap: Record<
        FunnelConversionWindowUnit,
        TimeIntervalUnit
    > = {
        hours: TimeIntervalUnit.HOUR,
        days: TimeIntervalUnit.DAY,
        weeks: TimeIntervalUnit.WEEK,
    };

    private analytics: LightdashAnalytics;

    private lightdashConfig: LightdashConfig;

    private projectModel: ProjectModel;

    private projectService: ProjectService;

    constructor({
        analytics,
        lightdashConfig,
        projectModel,
        projectService,
    }: FunnelServiceArguments) {
        super({ serviceName: 'FunnelService' });
        this.analytics = analytics;
        this.lightdashConfig = lightdashConfig;
        this.projectModel = projectModel;
        this.projectService = projectService;
    }

    private async checkCanAccessFunnelBuilder(
        user: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        if (!this.lightdashConfig.funnelBuilder.enabled) {
            throw new ForbiddenError('Funnel Builder feature is not enabled');
        }

        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            user.ability.cannot(
                'manage',
                subject('SqlRunner', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError(
                'User does not have access to SQL Runner in this project',
            );
        }
    }

    private static getDimensionFromFieldMap(
        fieldMap: Record<string, CompiledField | AdditionalMetric>,
        fieldId: string,
    ): CompiledDimension {
        const field = fieldMap[fieldId];

        if (!field) {
            throw new NotFoundError(`Field '${fieldId}' not found in explore`);
        }

        if (!isDimension(field)) {
            throw new NotFoundError(`Field '${fieldId}' is not a dimension`);
        }

        return field;
    }

    private static generateFunnelSql(
        request: FunnelQueryRequest,
        explore: Explore,
        sqlBuilder: WarehouseSqlBuilder,
    ): string {
        const stringQuote = sqlBuilder.getStringQuoteChar();
        const fieldQuote = sqlBuilder.getFieldQuoteChar();
        const fieldMap = getFieldMap(explore);

        // Helper to safely quote user-provided string values
        const quoteString = (value: string) =>
            `${stringQuote}${value.replace(
                new RegExp(stringQuote, 'g'),
                stringQuote + stringQuote,
            )}${stringQuote}`;

        const timestampField = FunnelService.getDimensionFromFieldMap(
            fieldMap,
            request.timestampFieldId,
        );
        const userIdField = FunnelService.getDimensionFromFieldMap(
            fieldMap,
            request.userIdFieldId,
        );
        const eventNameField = FunnelService.getDimensionFromFieldMap(
            fieldMap,
            request.eventNameFieldId,
        );
        const breakdownField = request.breakdownDimensionId
            ? FunnelService.getDimensionFromFieldMap(
                  fieldMap,
                  request.breakdownDimensionId,
              )
            : null;

        const baseTable = explore.tables[explore.baseTable].sqlTable;

        // Escape user-provided event names
        const stepNames = request.steps.map((s: FunnelStep) =>
            quoteString(s.eventName),
        );

        // Resolve date range from preset or custom
        const { start, end } = resolveFunnelDateRange(request.dateRange);

        // Build conversion window interval
        const windowInterval = request.conversionWindow
            ? sqlBuilder.getIntervalSql(
                  request.conversionWindow.value,
                  FunnelService.conversionWindowUnitMap[
                      request.conversionWindow.unit
                  ],
              )
            : sqlBuilder.getIntervalSql(30, TimeIntervalUnit.DAY);

        const breakdownSelect = breakdownField
            ? `, ${breakdownField.compiledSql} AS ${fieldQuote}breakdown_value${fieldQuote}`
            : '';

        const stepCTEs = request.steps
            .map(
                (step: FunnelStep, idx: number) => `
step_${idx + 1}_users AS (
    SELECT DISTINCT
        fo.${fieldQuote}user_id${fieldQuote},
        fo.${fieldQuote}event_timestamp${fieldQuote} AS ${fieldQuote}step_${
                    idx + 1
                }_time${fieldQuote}
        ${
            breakdownField
                ? `, fo.${fieldQuote}breakdown_value${fieldQuote}`
                : ''
        }
    FROM first_occurrences fo
    WHERE fo.${fieldQuote}event_name${fieldQuote} = ${quoteString(
                    step.eventName,
                )}
    ${
        idx > 0
            ? `
        AND EXISTS (
            SELECT 1 FROM step_${idx}_users prev
            WHERE prev.${fieldQuote}user_id${fieldQuote} = fo.${fieldQuote}user_id${fieldQuote}
              AND fo.${fieldQuote}event_timestamp${fieldQuote} > prev.${fieldQuote}step_${idx}_time${fieldQuote}
              AND fo.${fieldQuote}event_timestamp${fieldQuote} <= prev.${fieldQuote}step_${idx}_time${fieldQuote} + ${windowInterval}
              ${
                  breakdownField
                      ? `AND fo.${fieldQuote}breakdown_value${fieldQuote} = prev.${fieldQuote}breakdown_value${fieldQuote}`
                      : ''
              }
        )
    `
            : ''
    }
)`,
            )
            .join(',\n');

        const resultUnions = request.steps
            .map(
                (step: FunnelStep, idx: number) => `
    SELECT
        ${idx + 1} AS ${fieldQuote}step_order${fieldQuote},
        ${quoteString(step.eventName)} AS ${fieldQuote}step_name${fieldQuote},
        COUNT(DISTINCT s${
            idx + 1
        }.${fieldQuote}user_id${fieldQuote}) AS ${fieldQuote}total_users${fieldQuote}
        ${
            idx > 0
                ? `,
        ${sqlBuilder.getMedianSql(
            sqlBuilder.getTimestampDiffSeconds(
                `s${idx}.${fieldQuote}step_${idx}_time${fieldQuote}`,
                `s${idx + 1}.${fieldQuote}step_${idx + 1}_time${fieldQuote}`,
            ),
        )} AS ${fieldQuote}median_time_to_convert${fieldQuote}`
                : `, CAST(NULL AS ${sqlBuilder.getFloatingType()}) AS ${fieldQuote}median_time_to_convert${fieldQuote}`
        }
        ${
            breakdownField
                ? `, s${idx + 1}.${fieldQuote}breakdown_value${fieldQuote}`
                : ''
        }
    FROM step_${idx + 1}_users s${idx + 1}
    ${
        idx > 0
            ? `
    JOIN step_${idx}_users s${idx} ON s${
                  idx + 1
              }.${fieldQuote}user_id${fieldQuote} = s${idx}.${fieldQuote}user_id${fieldQuote}
        ${
            breakdownField
                ? `AND s${
                      idx + 1
                  }.${fieldQuote}breakdown_value${fieldQuote} = s${idx}.${fieldQuote}breakdown_value${fieldQuote}`
                : ''
        }
    `
            : ''
    }
    ${
        breakdownField
            ? `GROUP BY s${idx + 1}.${fieldQuote}breakdown_value${fieldQuote}`
            : ''
    }`,
            )
            .join('\n    UNION ALL\n    ');

        const partitionClause = breakdownField
            ? `PARTITION BY ${fieldQuote}breakdown_value${fieldQuote}`
            : '';

        return `
WITH filtered_events AS (
    SELECT
        ${userIdField.compiledSql} AS ${fieldQuote}user_id${fieldQuote},
        ${eventNameField.compiledSql} AS ${fieldQuote}event_name${fieldQuote},
        ${
            timestampField.compiledSql
        } AS ${fieldQuote}event_timestamp${fieldQuote}
        ${breakdownSelect}
    FROM ${baseTable}
    WHERE ${timestampField.compiledSql} >= ${sqlBuilder.castToTimestamp(start)}
      AND ${timestampField.compiledSql} < ${sqlBuilder.castToTimestamp(end)}
      AND ${eventNameField.compiledSql} IN (${stepNames.join(', ')})
),
user_step_times AS (
    SELECT
        ${fieldQuote}user_id${fieldQuote},
        ${fieldQuote}event_name${fieldQuote},
        ${fieldQuote}event_timestamp${fieldQuote}
        ${breakdownField ? `, ${fieldQuote}breakdown_value${fieldQuote}` : ''},
        ROW_NUMBER() OVER (
            PARTITION BY ${fieldQuote}user_id${fieldQuote}, ${fieldQuote}event_name${fieldQuote}
            ORDER BY ${fieldQuote}event_timestamp${fieldQuote}
        ) AS ${fieldQuote}event_occurrence${fieldQuote}
    FROM filtered_events
),
first_occurrences AS (
    SELECT
        ${fieldQuote}user_id${fieldQuote},
        ${fieldQuote}event_name${fieldQuote},
        ${fieldQuote}event_timestamp${fieldQuote}
        ${breakdownField ? `, ${fieldQuote}breakdown_value${fieldQuote}` : ''}
    FROM user_step_times
    WHERE ${fieldQuote}event_occurrence${fieldQuote} = 1
),
${stepCTEs},
funnel_results AS (
    ${resultUnions}
)
SELECT
    ${fieldQuote}step_order${fieldQuote},
    ${fieldQuote}step_name${fieldQuote},
    ${fieldQuote}total_users${fieldQuote},
    ${fieldQuote}median_time_to_convert${fieldQuote},
    -- Conversion rate relative to step 1 (per breakdown if applicable)
    CASE
        WHEN FIRST_VALUE(${fieldQuote}total_users${fieldQuote}) OVER (${partitionClause} ORDER BY ${fieldQuote}step_order${fieldQuote}) > 0
        THEN (${fieldQuote}total_users${fieldQuote} * 100.0) / FIRST_VALUE(${fieldQuote}total_users${fieldQuote}) OVER (${partitionClause} ORDER BY ${fieldQuote}step_order${fieldQuote})
        ELSE 0
    END AS ${fieldQuote}conversion_rate${fieldQuote},
    -- Step conversion rate relative to previous step
    CASE
        WHEN ${fieldQuote}step_order${fieldQuote} = 1 THEN 100.0
        WHEN LAG(${fieldQuote}total_users${fieldQuote}) OVER (${partitionClause} ORDER BY ${fieldQuote}step_order${fieldQuote}) > 0
        THEN (${fieldQuote}total_users${fieldQuote} * 100.0) / LAG(${fieldQuote}total_users${fieldQuote}) OVER (${partitionClause} ORDER BY ${fieldQuote}step_order${fieldQuote})
        ELSE 0
    END AS ${fieldQuote}step_conversion_rate${fieldQuote}
    ${breakdownField ? `, ${fieldQuote}breakdown_value${fieldQuote}` : ''}
FROM funnel_results
ORDER BY ${
            breakdownField ? `${fieldQuote}breakdown_value${fieldQuote}, ` : ''
        }${fieldQuote}step_order${fieldQuote}
`;
    }

    async getEventNames(
        user: SessionUser,
        projectUuid: string,
        exploreName: string,
        eventDimensionId: string,
        timestampFieldId: string,
    ): Promise<string[]> {
        return Sentry.startSpan(
            {
                op: 'FunnelService.getEventNames',
                name: 'FunnelService.getEventNames',
                attributes: {
                    projectUuid,
                    exploreName,
                },
            },
            async () => {
                await this.checkCanAccessFunnelBuilder(user, projectUuid);

                const exploreResult =
                    await this.projectModel.getExploreFromCache(
                        projectUuid,
                        exploreName,
                    );

                if (isExploreError(exploreResult)) {
                    throw new ForbiddenError(
                        `Explore ${exploreName} has errors: ${exploreResult.errors
                            .map((e) => e.message)
                            .join(', ')}`,
                    );
                }

                const explore = exploreResult;
                const fieldMap = getFieldMap(explore);
                const eventField = FunnelService.getDimensionFromFieldMap(
                    fieldMap,
                    eventDimensionId,
                );
                const timestampField = FunnelService.getDimensionFromFieldMap(
                    fieldMap,
                    timestampFieldId,
                );
                const baseTableSql = explore.tables[explore.baseTable].sqlTable;
                const baseTableName = explore.baseTable;

                // Get SQL builder based on warehouse type (no credentials needed for SQL generation)
                const credentials =
                    await this.projectModel.getWarehouseCredentialsForProject(
                        projectUuid,
                    );
                const sqlBuilder = warehouseSqlBuilderFromType(
                    credentials.type,
                );

                // Filter to last 30 days to limit scan cost
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                const quoteChar = sqlBuilder.getFieldQuoteChar();

                const sql = `
            SELECT DISTINCT ${
                eventField.compiledSql
            } AS ${quoteChar}event_name${quoteChar}
            FROM ${baseTableSql} AS ${quoteChar}${baseTableName}${quoteChar}
            WHERE ${eventField.compiledSql} IS NOT NULL
              AND ${timestampField.compiledSql} >= ${sqlBuilder.castToTimestamp(
                    thirtyDaysAgo,
                )}
            ORDER BY ${quoteChar}event_name${quoteChar}
            LIMIT 1000
        `;

                try {
                    const results = await this.projectService.runSqlQuery(
                        user,
                        projectUuid,
                        sql,
                    );

                    return results.rows
                        .map((r) => r.event_name as string)
                        .filter(
                            (val): val is string =>
                                val !== null && val !== undefined,
                        );
                } catch (error) {
                    this.logger.error('Failed to fetch event names', {
                        sql,
                        error,
                    });
                    throw error;
                }
            },
        );
    }

    async runFunnelQuery(
        user: SessionUser,
        projectUuid: string,
        request: FunnelQueryRequest,
    ): Promise<FunnelQueryResult> {
        return Sentry.startSpan(
            {
                op: 'FunnelService.runFunnelQuery',
                name: 'FunnelService.runFunnelQuery',
                attributes: {
                    projectUuid,
                    exploreName: request.exploreName,
                    stepCount: request.steps.length,
                },
            },
            async () => {
                await this.checkCanAccessFunnelBuilder(user, projectUuid);

                const exploreResult =
                    await this.projectModel.getExploreFromCache(
                        projectUuid,
                        request.exploreName,
                    );

                if (isExploreError(exploreResult)) {
                    throw new ForbiddenError(
                        `Explore ${
                            request.exploreName
                        } has errors: ${exploreResult.errors
                            .map((e) => e.message)
                            .join(', ')}`,
                    );
                }

                const explore = exploreResult;

                // Get SQL builder based on warehouse type (no credentials needed for SQL generation)
                const credentials =
                    await this.projectModel.getWarehouseCredentialsForProject(
                        projectUuid,
                    );
                const sqlBuilder = warehouseSqlBuilderFromType(
                    credentials.type,
                );

                const sql = FunnelService.generateFunnelSql(
                    request,
                    explore,
                    sqlBuilder,
                );

                this.logger.debug('Running funnel query', { sql });

                try {
                    const results = await this.projectService.runSqlQuery(
                        user,
                        projectUuid,
                        sql,
                    );

                    // Map rows directly - conversion rates are computed in SQL
                    const steps: FunnelStepResult[] = results.rows.map(
                        (row) => ({
                            stepOrder: Number(row.step_order),
                            stepName: row.step_name as string,
                            totalUsers: Number(row.total_users),
                            conversionRate: Number(row.conversion_rate),
                            stepConversionRate: Number(
                                row.step_conversion_rate,
                            ),
                            medianTimeToConvertSeconds:
                                row.median_time_to_convert != null
                                    ? Number(row.median_time_to_convert)
                                    : null,
                            breakdownValue: row.breakdown_value as
                                | string
                                | undefined,
                        }),
                    );

                    const { organizationUuid } =
                        await this.projectModel.getSummary(projectUuid);

                    this.analytics.track({
                        event: 'funnel.query_executed',
                        userId: user.userUuid,
                        properties: {
                            organizationId: organizationUuid,
                            projectId: projectUuid,
                            exploreName: request.exploreName,
                            stepCount: request.steps.length,
                            hasBreakdown: !!request.breakdownDimensionId,
                            hasConversionWindow: !!request.conversionWindow,
                        },
                    });

                    return {
                        steps,
                        sql,
                    };
                } catch (error) {
                    this.logger.error('Failed to run funnel query', {
                        sql,
                        error,
                    });
                    throw error;
                }
            },
        );
    }
}
