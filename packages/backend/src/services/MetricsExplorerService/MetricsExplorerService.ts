import { subject } from '@casl/ability';
import type {
    Dimension,
    ItemsMap,
    MetricExploreDataPoint,
    MetricsExplorerQueryResults,
} from '@lightdash/common';
import {
    assertUnreachable,
    FilterOperator,
    ForbiddenError,
    getDateCalcUtils,
    getDefaultDateRangeForMetricTotal,
    getFieldIdForDateDimension,
    getItemId,
    getMetricExplorerDataPoints,
    getMetricExplorerDataPointsWithCompare,
    getMetricExplorerDateRangeFilters,
    isDimension,
    MetricExplorerComparison,
    MetricExplorerComparisonType,
    MetricTotalComparisonType,
    TimeFrames,
    UnitOfTime,
    type MetricExplorerDateRange,
    type MetricQuery,
    type MetricWithAssociatedTimeDimension,
    type ResultRow,
    type SessionUser,
    type TimeDimensionConfig,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import type { LightdashConfig } from '../../config/parseConfig';
import { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../BaseService';
import { CatalogService } from '../CatalogService/CatalogService';
import type { ProjectService } from '../ProjectService/ProjectService';

export type MetricsExplorerArguments<T extends CatalogModel = CatalogModel> = {
    lightdashConfig: LightdashConfig;
    catalogModel: T;
    projectModel: ProjectModel;
    catalogService: CatalogService;
    projectService: ProjectService;
};

export class MetricsExplorerService<
    T extends CatalogModel = CatalogModel,
> extends BaseService {
    maxQueryLimit: LightdashConfig['query']['maxLimit'];

    catalogModel: T;

    projectModel: ProjectModel;

    catalogService: CatalogService;

    projectService: ProjectService;

    constructor({
        lightdashConfig,
        catalogModel,
        catalogService,
        projectModel,
        projectService,
    }: MetricsExplorerArguments<T>) {
        super();
        this.maxQueryLimit = lightdashConfig.query.maxLimit;
        this.catalogModel = catalogModel;
        this.catalogService = catalogService;
        this.projectModel = projectModel;
        this.projectService = projectService;
    }

    private async runComparePreviousPeriodMetricQuery(
        user: SessionUser,
        projectUuid: string,
        exploreName: string,
        metricQuery: MetricQuery,
        timeDimensionConfig: TimeDimensionConfig,
        dateRange: MetricExplorerDateRange,
    ): Promise<{
        rows: ResultRow[];
        fields: ItemsMap;
        dimension: Dimension;
    }> {
        const forwardBackDateRange: MetricExplorerDateRange = [
            oneYearBack(dateRange[0]),
            oneYearBack(dateRange[1]),
        ];

        const adjustedMetricQuery: MetricQuery = {
            ...metricQuery,
            filters: {
                dimensions: {
                    id: uuidv4(),
                    and: getMetricExplorerDateRangeFilters(
                        timeDimensionConfig.table,
                        timeDimensionConfig.field,
                        forwardBackDateRange,
                    ),
                },
            },
        };

        const { rows, fields } = await this.projectService.runExploreQuery(
            user,
            adjustedMetricQuery,
            projectUuid,
            exploreName,
            null,
        );

        // Comparison uses the same dimension as the base metric
        const compareDimension = fields[adjustedMetricQuery.dimensions[0]];
        if (!compareDimension || !isDimension(compareDimension)) {
            throw new Error('Compare dimension not found or invalid');
        }

        return {
            rows,
            fields,
            dimension: compareDimension,
        };
    }

    private async runCompareDifferentMetricQuery(
        user: SessionUser,
        projectUuid: string,
        compare: Extract<
            MetricExplorerComparisonType,
            { type: MetricExplorerComparison.DIFFERENT_METRIC }
        >,
        dateRange: MetricExplorerDateRange,
        timeDimensionOverride: TimeDimensionConfig | undefined,
    ): Promise<{
        rows: ResultRow[];
        fields: ItemsMap;
        dimension: Dimension;
        metric: MetricWithAssociatedTimeDimension;
    }> {
        const metric = await this.catalogService.getMetric(
            user,
            projectUuid,
            compare.metricTable,
            compare.metricName,
            timeDimensionOverride?.interval,
        );

        const { timeDimension } = metric;
        if (!timeDimension) {
            throw new Error(
                `Comparison metric should always have an associated time dimension`,
            );
        }

        const metricDimensionGrain = timeDimensionOverride
            ? timeDimensionOverride.interval
            : timeDimension.interval;

        const dimensionName = getFieldIdForDateDimension(
            timeDimension.field,
            metricDimensionGrain,
        );
        const dimensionFieldId = getItemId({
            table: timeDimension.table,
            name: dimensionName,
        });

        const metricQuery: MetricQuery = {
            exploreName: compare.metricTable,
            metrics: [getItemId(metric)],
            dimensions: [dimensionFieldId],
            filters: {
                dimensions: {
                    id: uuidv4(),
                    and: getMetricExplorerDateRangeFilters(
                        timeDimension.table,
                        timeDimension.field,
                        dateRange,
                    ),
                },
            },
            sorts: [{ fieldId: dimensionFieldId, descending: false }],
            tableCalculations: [],
            limit: this.maxQueryLimit,
        };

        const { rows, fields } = await this.projectService.runExploreQuery(
            user,
            metricQuery,
            projectUuid,
            compare.metricTable,
            null,
        );

        const dimension = fields[metricQuery.dimensions[0]];
        if (!dimension || !isDimension(dimension)) {
            throw new Error('Compare dimension not found or invalid');
        }

        return {
            rows,
            fields,
            dimension,
            metric,
        };
    }

    async runMetricExplorerQuery(
        user: SessionUser,
        projectUuid: string,
        exploreName: string,
        metricName: string,
        dateRange: MetricExplorerDateRange,
        compare: MetricExplorerComparisonType,
        timeDimensionOverride: TimeDimensionConfig | undefined,
    ): Promise<MetricsExplorerQueryResults> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const metric = await this.catalogService.getMetric(
            user,
            projectUuid,
            exploreName,
            metricName,
        );

        const timeDimensionConfig =
            timeDimensionOverride ?? metric.timeDimension;

        const dimensionGrain =
            timeDimensionConfig?.interval ?? getGrainForDateRange(dateRange);

        const timeDimensionFieldId = getFieldIdForDateDimension(
            timeDimensionConfig?.field || '',
            dimensionGrain,
        );
        const timeDimension = getItemId({
            table: timeDimensionConfig?.table || '',
            name: timeDimensionFieldId,
        });

        const metricQuery: MetricQuery = {
            exploreName,
            dimensions: [timeDimension],
            metrics: [getItemId(metric)],
            filters: {
                dimensions: {
                    id: uuidv4(),
                    and: getMetricExplorerDateRangeFilters(
                        timeDimensionConfig?.table || '',
                        timeDimensionConfig?.field || '',
                        dateRange,
                    ),
                },
            },
            sorts: [{ fieldId: timeDimension, descending: false }],
            tableCalculations: [],
            limit: this.maxQueryLimit,
        };

        const { rows: currentResults, fields } =
            await this.projectService.runExploreQuery(
                user,
                metricQuery,
                projectUuid,
                exploreName,
                null,
            );

        let allFields = fields;
        let comparisonResults: ResultRow[] | undefined;
        let compareDimension: Dimension | undefined;
        let compareMetric: MetricWithAssociatedTimeDimension | undefined;

        switch (compare.type) {
            case MetricExplorerComparison.PREVIOUS_PERIOD: {
                const {
                    rows: prevRows,
                    fields: prevFields,
                    dimension: compDim,
                } = await this.runComparePreviousPeriodMetricQuery(
                    user,
                    projectUuid,
                    exploreName,
                    metricQuery,
                    {
                        table:
                            timeDimensionOverride?.table ||
                            metric.timeDimension?.table ||
                            '',
                        field:
                            timeDimensionOverride?.field ||
                            metric.timeDimension?.field ||
                            '',
                        interval: dimensionGrain,
                    },
                    dateRange,
                );
                comparisonResults = prevRows;
                allFields = { ...allFields, ...prevFields };
                compareDimension = compDim;
                compareMetric = metric;
                break;
            }
            case MetricExplorerComparison.DIFFERENT_METRIC: {
                const {
                    rows: diffRows,
                    fields: diffFields,
                    dimension: compDim,
                    metric: diffMetric,
                } = await this.runCompareDifferentMetricQuery(
                    user,
                    projectUuid,
                    compare,
                    dateRange,
                    timeDimensionOverride,
                );
                comparisonResults = diffRows;
                allFields = { ...allFields, ...diffFields };
                compareDimension = compDim;
                compareMetric = diffMetric;
                break;
            }
            case MetricExplorerComparison.NONE: {
                break;
            }
            default: {
                assertUnreachable(
                    compare,
                    `Unknown comparison type: ${compare}`,
                );
            }
        }

        const baseDimension = allFields[timeDimension];
        if (!baseDimension || !isDimension(baseDimension)) {
            throw new Error('Time dimension not found or invalid');
        }

        let dataPoints: MetricExploreDataPoint[] = [];
        const metricWithTimeDimension: MetricWithAssociatedTimeDimension = {
            ...metric,
            timeDimension: {
                table:
                    timeDimensionOverride?.table ||
                    metric.timeDimension?.table ||
                    '',
                field:
                    timeDimensionOverride?.field ||
                    metric.timeDimension?.field ||
                    '',
                interval: dimensionGrain,
            },
        };

        if (!compare || compare.type === MetricExplorerComparison.NONE) {
            dataPoints = getMetricExplorerDataPoints(
                baseDimension,
                metricWithTimeDimension,
                currentResults,
            );
        } else {
            if (!comparisonResults) {
                throw new Error(
                    `Comparison results expected for ${compare.type}`,
                );
            }

            compareDimension = compareDimension || baseDimension;
            dataPoints = getMetricExplorerDataPointsWithCompare(
                baseDimension,
                compareDimension,
                metricWithTimeDimension,
                currentResults,
                comparisonResults,
                compare,
            );
        }

        const results = dataPoints
            .map((dp) => ({ ...dp, dateValue: dp.date.valueOf() }))
            .sort((a, b) => a.dateValue - b.dateValue);

        return {
            results,
            fields: allFields,
            metric: metricWithTimeDimension,
            compareMetric,
        };
    }

    async getMetricTotal(
        user: SessionUser,
        projectUuid: string,
        exploreName: string,
        metricName: string,
        timeFrame: TimeFrames,
        comparisonType: MetricTotalComparisonType = MetricTotalComparisonType.NONE,
    ): Promise<MetricTotalResults> {
        const metric = await this.catalogService.getMetric(
            user,
            projectUuid,
            exploreName,
            metricName,
            timeFrame,
        );

        if (!metric.timeDimension) {
            throw new Error(
                `Metric ${metricName} does not have a valid time dimension`,
            );
        }

        const dateRange = getDefaultDateRangeForMetricTotal(timeFrame);

        const metricQuery: MetricQuery = {
            exploreName,
            dimensions: [],
            metrics: [getItemId(metric)],
            filters: {
                dimensions: {
                    id: uuidv4(),
                    and: getMetricExplorerDateRangeFilters(
                        metric.timeDimension.table,
                        metric.timeDimension.field,
                        dateRange,
                    ),
                },
            },
            sorts: [],
            limit: 1,
            tableCalculations: [],
        };

        const { rows: currentRows } = await this.projectService.runExploreQuery(
            user,
            metricQuery,
            projectUuid,
            exploreName,
            null,
        );

        let compareRows: ResultRow[] | undefined;

        if (comparisonType === MetricTotalComparisonType.PREVIOUS_PERIOD) {
            const compareDateRange: MetricExplorerDateRange = [
                getDateCalcUtils(timeFrame).back(dateRange[0]),
                getDateCalcUtils(timeFrame).back(dateRange[1]),
            ];

            const compareMetricQuery = {
                ...metricQuery,
                filters: {
                    dimensions: {
                        id: uuidv4(),
                        and: getMetricExplorerDateRangeFilters(
                            metric.timeDimension.table,
                            metric.timeDimension.field,
                            compareDateRange,
                        ),
                    },
                },
            };

            compareRows = (
                await this.projectService.runExploreQuery(
                    user,
                    compareMetricQuery,
                    projectUuid,
                    exploreName,
                    null,
                )
            ).rows;
        }

        return {
            value: currentRows[0]?.[getItemId(metric)]?.value,
            comparisonValue: compareRows?.[0]?.[getItemId(metric)]?.value,
        };
    }
}
