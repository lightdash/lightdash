import {
    buildRollingPeriodCustomDimension,
    getDateCalcUtils,
    getDateRangeFromString,
    getFieldIdForDateDimension,
    getItemId,
    getMetricExplorerDateRangeFilters,
    getRollingPeriodDates,
    MetricTotalComparisonType,
    MetricTotalResults,
    parseMetricValue,
    QueryExecutionContext,
    TimeFrames,
    type MetricExplorerDateRange,
    type MetricQuery,
    type MetricWithAssociatedTimeDimension,
    type SessionUser,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import { fromSession } from '../../auth/account';
import { measureTime } from '../../logging/measureTime';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type { AsyncQueryService } from '../AsyncQueryService/AsyncQueryService';
import { BaseService } from '../BaseService';
import { CatalogService } from '../CatalogService/CatalogService';
import type { ProjectService } from '../ProjectService/ProjectService';

export type MetricsExplorerArguments = {
    projectModel: ProjectModel;
    catalogService: CatalogService;
    projectService: ProjectService;
    asyncQueryService: AsyncQueryService;
};

export class MetricsExplorerService extends BaseService {
    projectModel: ProjectModel;

    catalogService: CatalogService;

    projectService: ProjectService;

    asyncQueryService: AsyncQueryService;

    constructor({
        catalogService,
        projectModel,
        projectService,
        asyncQueryService,
    }: MetricsExplorerArguments) {
        super();
        this.catalogService = catalogService;
        this.projectModel = projectModel;
        this.projectService = projectService;
        this.asyncQueryService = asyncQueryService;
    }

    async getMetricTotal(
        user: SessionUser,
        projectUuid: string,
        exploreName: string,
        metricName: string,
        timeFrame: TimeFrames,
        granularity: TimeFrames,
        startDate: string,
        endDate: string,
        comparisonType: MetricTotalComparisonType = MetricTotalComparisonType.NONE,
        rollingDays?: number,
    ): Promise<MetricTotalResults> {
        const { result } = await measureTime(
            () =>
                this._getMetricTotal(
                    user,
                    projectUuid,
                    exploreName,
                    metricName,
                    timeFrame,
                    granularity,
                    startDate,
                    endDate,
                    comparisonType,
                    rollingDays,
                ),
            'getMetricTotal',
            this.logger,
            {
                timeFrame,
                comparisonType,
                rollingDays,
            },
        );

        return result;
    }

    private async _getMetricTotal(
        user: SessionUser,
        projectUuid: string,
        exploreName: string,
        metricName: string,
        timeFrame: TimeFrames,
        granularity: TimeFrames,
        startDate: string,
        endDate: string,
        comparisonType: MetricTotalComparisonType = MetricTotalComparisonType.NONE,
        rollingDays?: number,
    ): Promise<MetricTotalResults> {
        const metric = await this.catalogService.getMetric(
            user,
            projectUuid,
            exploreName,
            metricName,
            granularity,
        );

        if (!metric.timeDimension) {
            throw new Error(
                `Metric ${metricName} does not have a valid time dimension`,
            );
        }

        const dateRange = getDateRangeFromString([startDate, endDate]);
        const baseMetricId = getItemId(metric);
        const metricQuery = await this.buildMetricTotalQuery({
            projectUuid,
            exploreName,
            metric,
            timeFrame,
            granularity,
            dateRange,
            comparisonType,
            rollingDays,
        });

        const { rows: currentRows } =
            await this.asyncQueryService.executeMetricQueryAndGetResults({
                account: fromSession(user),
                projectUuid,
                metricQuery,
                context: QueryExecutionContext.METRICS_EXPLORER,
            });

        return {
            value: parseMetricValue(currentRows[0]?.[baseMetricId]),
            comparisonValue: parseMetricValue(currentRows[1]?.[baseMetricId]),
            metric,
        };
    }

    private async buildMetricTotalQuery({
        projectUuid,
        exploreName,
        metric,
        timeFrame,
        granularity,
        dateRange,
        comparisonType,
        rollingDays,
    }: {
        projectUuid: string;
        exploreName: string;
        metric: MetricWithAssociatedTimeDimension;
        timeFrame: TimeFrames;
        granularity: TimeFrames;
        dateRange: MetricExplorerDateRange;
        comparisonType: MetricTotalComparisonType;
        rollingDays?: number;
    }): Promise<MetricQuery> {
        const baseMetricId = getItemId(metric);
        const metricTimeDimension = metric.timeDimension;
        if (!metricTimeDimension) {
            throw new Error('Time dimension not found');
        }

        // Handle rolling days comparison with custom SQL dimension
        if (comparisonType === MetricTotalComparisonType.ROLLING_DAYS) {
            if (!rollingDays) {
                throw new Error(
                    'rollingDays is required for ROLLING_DAYS comparison type',
                );
            }
            return this.buildRollingComparisonQuery({
                projectUuid,
                exploreName,
                metric,
                rollingDays,
            });
        }

        const groupByTimeDimensionFieldId = getFieldIdForDateDimension(
            metricTimeDimension.field,
            timeFrame,
        );
        const groupByTimeDimensionId = getItemId({
            table: metricTimeDimension.table,
            name: groupByTimeDimensionFieldId,
        });

        const compareDateRange =
            comparisonType === MetricTotalComparisonType.PREVIOUS_PERIOD
                ? ([
                      getDateCalcUtils(timeFrame, granularity).back(
                          dateRange[0],
                      ),
                      getDateCalcUtils(timeFrame, granularity).back(
                          dateRange[1],
                      ),
                  ] as MetricExplorerDateRange)
                : null;

        const filterTimeDimension = {
            table: metricTimeDimension.table,
            field: metricTimeDimension.field,
            interval: TimeFrames.DAY,
        };

        const currentDateFilters = getMetricExplorerDateRangeFilters(
            filterTimeDimension,
            dateRange,
        );
        const compareDateFilters = compareDateRange
            ? getMetricExplorerDateRangeFilters(
                  filterTimeDimension,
                  compareDateRange,
              )
            : [];

        return {
            exploreName,
            dimensions: [groupByTimeDimensionId],
            metrics: [baseMetricId],
            filters: {
                dimensions: {
                    id: uuidv4(),
                    ...(compareDateRange
                        ? { or: [currentDateFilters[0], compareDateFilters[0]] }
                        : { and: currentDateFilters }),
                },
            },
            sorts: [
                {
                    fieldId: groupByTimeDimensionId,
                    descending: true,
                },
            ],
            limit: 2,
            tableCalculations: [],
        };
    }

    /**
     * Build a query for rolling period comparisons using custom SQL dimension.
     * Groups by a 'period' custom dimension (0=current, 1=previous) instead of time.
     */
    private async buildRollingComparisonQuery({
        projectUuid,
        exploreName,
        metric,
        rollingDays,
    }: {
        projectUuid: string;
        exploreName: string;
        metric: MetricWithAssociatedTimeDimension;
        rollingDays: number;
    }): Promise<MetricQuery> {
        const baseMetricId = getItemId(metric);
        const metricTimeDimension = metric.timeDimension;
        if (!metricTimeDimension) {
            throw new Error('Time dimension not found');
        }

        const credentials =
            await this.projectModel.getWarehouseCredentialsForProject(
                projectUuid,
            );
        const adapterType = credentials.type;

        const { current, previous } = getRollingPeriodDates(rollingDays);
        const timeDimensionFieldRef = `\${${metricTimeDimension.table}.${metricTimeDimension.field}}`;

        const periodDimension = buildRollingPeriodCustomDimension(
            timeDimensionFieldRef,
            metricTimeDimension.table,
            rollingDays,
            adapterType,
        );

        const filterTimeDimension = {
            table: metricTimeDimension.table,
            field: metricTimeDimension.field,
            interval: TimeFrames.DAY,
        };

        // Use OR filter on date ranges (same pattern as calendar comparisons)
        const currentDateFilters = getMetricExplorerDateRangeFilters(
            filterTimeDimension,
            [current.start.toDate(), current.end.toDate()],
        );
        const previousDateFilters = getMetricExplorerDateRangeFilters(
            filterTimeDimension,
            [previous.start.toDate(), previous.end.toDate()],
        );

        return {
            exploreName,
            dimensions: [periodDimension.id],
            metrics: [baseMetricId],
            customDimensions: [periodDimension],
            filters: {
                dimensions: {
                    id: uuidv4(),
                    or: [currentDateFilters[0], previousDateFilters[0]],
                },
            },
            sorts: [
                {
                    fieldId: periodDimension.id,
                    descending: false, // 0 (current) first, then 1 (previous)
                },
            ],
            limit: 2,
            tableCalculations: [],
        };
    }

    async compileMetricTotalQuery(
        user: SessionUser,
        projectUuid: string,
        exploreName: string,
        metricName: string,
        timeFrame: TimeFrames,
        granularity: TimeFrames,
        startDate: string,
        endDate: string,
        comparisonType: MetricTotalComparisonType = MetricTotalComparisonType.NONE,
        rollingDays?: number,
    ) {
        const metric = await this.catalogService.getMetric(
            user,
            projectUuid,
            exploreName,
            metricName,
            granularity,
        );

        if (!metric.timeDimension) {
            throw new Error(
                `Metric ${metricName} does not have a valid time dimension`,
            );
        }

        const dateRange = getDateRangeFromString([startDate, endDate]);
        const metricQuery = await this.buildMetricTotalQuery({
            projectUuid,
            exploreName,
            metric,
            timeFrame,
            granularity,
            dateRange,
            comparisonType,
            rollingDays,
        });

        const compiledQuery = await this.projectService.compileQuery({
            account: fromSession(user),
            projectUuid,
            exploreName,
            body: metricQuery,
        });

        return compiledQuery;
    }
}
