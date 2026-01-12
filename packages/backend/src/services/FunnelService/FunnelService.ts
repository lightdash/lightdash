import { subject } from '@casl/ability';
import {
    type AdditionalMetric,
    CompiledDimension,
    CompiledField,
    Explore,
    ForbiddenError,
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
} from '@lightdash/common';
import type { WarehouseClient } from '@lightdash/warehouses';
import type { LightdashConfig } from '../../config/parseConfig';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../BaseService';
import type { ProjectService } from '../ProjectService/ProjectService';

type FunnelServiceArguments = {
    lightdashConfig: LightdashConfig;
    projectModel: ProjectModel;
    projectService: ProjectService;
};

export class FunnelService extends BaseService {
    private lightdashConfig: LightdashConfig;

    private projectModel: ProjectModel;

    private projectService: ProjectService;

    constructor({
        lightdashConfig,
        projectModel,
        projectService,
    }: FunnelServiceArguments) {
        super({ serviceName: 'FunnelService' });
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
        warehouseClient: WarehouseClient,
    ): string {
        const stringQuote = warehouseClient.getStringQuoteChar();
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
        const startDateStr = start.toISOString();
        const endDateStr = end.toISOString();

        // Build conversion window interval
        const windowInterval = request.conversionWindow
            ? `INTERVAL '${request.conversionWindow.value} ${request.conversionWindow.unit}'`
            : `INTERVAL '30 days'`; // Default 30 day window

        const breakdownSelect = breakdownField
            ? `, ${breakdownField.compiledSql} AS breakdown_value`
            : '';

        const stepCTEs = request.steps
            .map(
                (step: FunnelStep, idx: number) => `
step_${idx + 1}_users AS (
    SELECT DISTINCT
        fo.user_id,
        fo.event_timestamp AS step_${idx + 1}_time
        ${breakdownField ? ', fo.breakdown_value' : ''}
    FROM first_occurrences fo
    WHERE fo.event_name = ${quoteString(step.eventName)}
    ${
        idx > 0
            ? `
        AND EXISTS (
            SELECT 1 FROM step_${idx}_users prev
            WHERE prev.user_id = fo.user_id
              AND fo.event_timestamp > prev.step_${idx}_time
              AND fo.event_timestamp <= prev.step_${idx}_time + ${windowInterval}
              ${
                  breakdownField
                      ? 'AND fo.breakdown_value = prev.breakdown_value'
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
        ${idx + 1} AS step_order,
        ${quoteString(step.eventName)} AS step_name,
        COUNT(DISTINCT s${idx + 1}.user_id) AS total_users
        ${
            idx > 0
                ? `,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (s${idx + 1}.step_${
                      idx + 1
                  }_time - s${idx}.step_${idx}_time))
        ) AS median_time_to_convert`
                : ', NULL::float AS median_time_to_convert'
        }
        ${breakdownField ? `, s${idx + 1}.breakdown_value` : ''}
    FROM step_${idx + 1}_users s${idx + 1}
    ${
        idx > 0
            ? `
    JOIN step_${idx}_users s${idx} ON s${idx + 1}.user_id = s${idx}.user_id
        ${
            breakdownField
                ? `AND s${idx + 1}.breakdown_value = s${idx}.breakdown_value`
                : ''
        }
    `
            : ''
    }
    ${breakdownField ? `GROUP BY s${idx + 1}.breakdown_value` : ''}`,
            )
            .join('\n    UNION ALL\n    ');

        const partitionClause = breakdownField
            ? 'PARTITION BY breakdown_value'
            : '';

        return `
WITH filtered_events AS (
    SELECT
        ${userIdField.compiledSql} AS user_id,
        ${eventNameField.compiledSql} AS event_name,
        ${timestampField.compiledSql} AS event_timestamp
        ${breakdownSelect}
    FROM ${baseTable}
    WHERE ${timestampField.compiledSql} >= '${startDateStr}'::timestamp
      AND ${timestampField.compiledSql} < '${endDateStr}'::timestamp
      AND ${eventNameField.compiledSql} IN (${stepNames.join(', ')})
),
user_step_times AS (
    SELECT
        user_id,
        event_name,
        event_timestamp
        ${breakdownField ? ', breakdown_value' : ''},
        ROW_NUMBER() OVER (
            PARTITION BY user_id, event_name
            ORDER BY event_timestamp
        ) AS event_occurrence
    FROM filtered_events
),
first_occurrences AS (
    SELECT
        user_id,
        event_name,
        event_timestamp
        ${breakdownField ? ', breakdown_value' : ''}
    FROM user_step_times
    WHERE event_occurrence = 1
),
${stepCTEs},
funnel_results AS (
    ${resultUnions}
)
SELECT
    step_order,
    step_name,
    total_users,
    median_time_to_convert,
    -- Conversion rate relative to step 1 (per breakdown if applicable)
    CASE
        WHEN FIRST_VALUE(total_users) OVER (${partitionClause} ORDER BY step_order) > 0
        THEN (total_users * 100.0) / FIRST_VALUE(total_users) OVER (${partitionClause} ORDER BY step_order)
        ELSE 0
    END AS conversion_rate,
    -- Step conversion rate relative to previous step
    CASE
        WHEN step_order = 1 THEN 100.0
        WHEN LAG(total_users) OVER (${partitionClause} ORDER BY step_order) > 0
        THEN (total_users * 100.0) / LAG(total_users) OVER (${partitionClause} ORDER BY step_order)
        ELSE 0
    END AS step_conversion_rate
    ${breakdownField ? ', breakdown_value' : ''}
FROM funnel_results
ORDER BY ${breakdownField ? 'breakdown_value, ' : ''}step_order
`;
    }

    async getEventNames(
        user: SessionUser,
        projectUuid: string,
        exploreName: string,
        eventDimensionId: string,
        timestampFieldId: string,
    ): Promise<string[]> {
        await this.checkCanAccessFunnelBuilder(user, projectUuid);

        const exploreResult = await this.projectModel.getExploreFromCache(
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
        const baseTable = explore.tables[explore.baseTable].sqlTable;

        // Filter to last 30 days to limit scan cost
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const startDate = thirtyDaysAgo.toISOString();

        const sql = `
            SELECT DISTINCT ${eventField.compiledSql} AS event_name
            FROM ${baseTable}
            WHERE ${eventField.compiledSql} IS NOT NULL
              AND ${timestampField.compiledSql} >= '${startDate}'::timestamp
            ORDER BY event_name
            LIMIT 1000
        `;

        const results = await this.projectService.runSqlQuery(
            user,
            projectUuid,
            sql,
        );

        return results.rows
            .map((r) => r.event_name as string)
            .filter((val): val is string => val !== null && val !== undefined);
    }

    async runFunnelQuery(
        user: SessionUser,
        projectUuid: string,
        request: FunnelQueryRequest,
    ): Promise<FunnelQueryResult> {
        await this.checkCanAccessFunnelBuilder(user, projectUuid);

        const exploreResult = await this.projectModel.getExploreFromCache(
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

        // Get warehouse client to generate the SQL with proper escaping
        const warehouseClient =
            await this.projectModel.getWarehouseClientFromCredentials(
                await this.projectModel.getWarehouseCredentialsForProject(
                    projectUuid,
                ),
            );

        const sql = FunnelService.generateFunnelSql(
            request,
            explore,
            warehouseClient,
        );

        this.logger.debug('Running funnel query', { sql });

        const results = await this.projectService.runSqlQuery(
            user,
            projectUuid,
            sql,
        );

        // Map rows directly - conversion rates are computed in SQL
        const steps: FunnelStepResult[] = results.rows.map((row) => ({
            stepOrder: Number(row.step_order),
            stepName: row.step_name as string,
            totalUsers: Number(row.total_users),
            conversionRate: Number(row.conversion_rate),
            stepConversionRate: Number(row.step_conversion_rate),
            medianTimeToConvertSeconds:
                row.median_time_to_convert != null
                    ? Number(row.median_time_to_convert)
                    : null,
            breakdownValue: row.breakdown_value as string | undefined,
        }));

        return {
            steps,
            sql,
        };
    }
}
