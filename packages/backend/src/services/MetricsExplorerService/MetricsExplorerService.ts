import {
    buildRollingPeriodCustomDimension,
    getDateCalcUtils,
    getDateRangeFromString,
    getFieldIdForDateDimension,
    getItemId,
    getMetricExplorerDataPoints,
    getMetricExplorerDateRangeFilters,
    getRollingPeriodDates,
    isDimension,
    MetricTotalComparisonType,
    MetricTotalResults,
    ParameterError,
    parseMetricValue,
    QueryExecutionContext,
    TimeFrames,
    type MetricExplorerDateRange,
    type MetricQuery,
    type MetricsExplorerQueryResults,
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

const METRIC_SERIES_LIMIT = 500;

const buildMetricSeriesQuery = ({
    exploreName,
    metric,
    granularity,
    dateRange,
}: {
    exploreName: string;
    metric: MetricWithAssociatedTimeDimension;
    granularity: TimeFrames;
    dateRange: MetricExplorerDateRange;
}): MetricQuery => {
    const baseMetricId = getItemId(metric);
    const metricTimeDimension = metric.timeDimension;
    if (!metricTimeDimension) {
        throw new Error('Time dimension not found');
    }

    const groupByTimeDimensionId = getItemId({
        table: metricTimeDimension.table,
        name: getFieldIdForDateDimension(
            metricTimeDimension.field,
            granularity,
        ),
    });

    const filterTimeDimension = {
        table: metricTimeDimension.table,
        field: metricTimeDimension.field,
        interval: TimeFrames.DAY,
    };
    const dateFilters = getMetricExplorerDateRangeFilters(
        filterTimeDimension,
        dateRange,
    );

    return {
        exploreName,
        dimensions: [groupByTimeDimensionId],
        metrics: [baseMetricId],
        filters: {
            dimensions: {
                id: uuidv4(),
                and: dateFilters,
            },
        },
        sorts: [
            {
                fieldId: groupByTimeDimensionId,
                descending: false,
            },
        ],
        limit: METRIC_SERIES_LIMIT,
        tableCalculations: [],
    };
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
            fromSession(user),
            projectUuid,
            exploreName,
            metricName,
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

    async getMetricSeries(
        user: SessionUser,
        projectUuid: string,
        exploreName: string,
        metricName: string,
        granularity: TimeFrames,
        startDate: string,
        endDate: string,
    ): Promise<MetricsExplorerQueryResults> {
        const { result } = await measureTime(
            () =>
                this._getMetricSeries(
                    user,
                    projectUuid,
                    exploreName,
                    metricName,
                    granularity,
                    startDate,
                    endDate,
                ),
            'getMetricSeries',
            this.logger,
            { granularity },
        );

        return result;
    }

    private async _getMetricSeries(
        user: SessionUser,
        projectUuid: string,
        exploreName: string,
        metricName: string,
        granularity: TimeFrames,
        startDate: string,
        endDate: string,
    ): Promise<MetricsExplorerQueryResults> {
        const metric = await this.catalogService.getMetric(
            fromSession(user),
            projectUuid,
            exploreName,
            metricName,
        );

        if (!metric.timeDimension) {
            throw new ParameterError(
                `Metric ${metricName} does not have a valid time dimension`,
            );
        }

        const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
        if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
            throw new ParameterError(
                'startDate and endDate must be YYYY-MM-DD dates',
            );
        }

        const dateRange = getDateRangeFromString([startDate, endDate]);
        const groupByTimeDimensionId = getItemId({
            table: metric.timeDimension.table,
            name: getFieldIdForDateDimension(
                metric.timeDimension.field,
                granularity,
            ),
        });
        const metricQuery = buildMetricSeriesQuery({
            exploreName,
            metric,
            granularity,
            dateRange,
        });

        const { rows, fields } =
            await this.asyncQueryService.executeMetricQueryAndGetResults({
                account: fromSession(user),
                projectUuid,
                metricQuery,
                context: QueryExecutionContext.METRICS_EXPLORER,
            });

        const timeDimension = fields[groupByTimeDimensionId];
        if (!timeDimension || !isDimension(timeDimension)) {
            throw new Error('Time dimension not found or invalid');
        }

        const { dataPoints } = getMetricExplorerDataPoints(
            timeDimension,
            metric,
            rows,
            null,
        );
        const points = dataPoints
            .map((point) => ({ ...point, dateValue: point.date.valueOf() }))
            .sort((a, b) => a.dateValue - b.dateValue);

        return { metric, points };
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
        // Reference the day-truncated dimension so the CASE bucket boundaries
        // match the WHERE filter (which uses interval: TimeFrames.DAY → field_day).
        // Without this, records with timestamps after midnight on boundary dates
        // pass the WHERE but fall through to NULL in the CASE.
        const timeDimensionFieldRef = `\${${metricTimeDimension.table}.${getFieldIdForDateDimension(metricTimeDimension.field, TimeFrames.DAY)}}`;

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
            fromSession(user),
            projectUuid,
            exploreName,
            metricName,
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
