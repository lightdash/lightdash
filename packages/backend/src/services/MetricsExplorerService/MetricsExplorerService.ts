import { subject } from '@casl/ability';
import {
    AnyType,
    Dimension,
    FilterRule,
    ForbiddenError,
    ItemsMap,
    MAX_SEGMENT_DIMENSION_UNIQUE_VALUES,
    MetricExploreDataPoint,
    MetricExplorerComparison,
    MetricExplorerQuery,
    MetricTotalComparisonType,
    MetricTotalResults,
    MetricsExplorerQueryResults,
    TimeFrames,
    assertUnreachable,
    getDateCalcUtils,
    getDateRangeFromString,
    getFieldIdForDateDimension,
    getGrainForDateRange,
    getItemId,
    getMetricExplorerDataPoints,
    getMetricExplorerDataPointsWithCompare,
    getMetricExplorerDateRangeFilters,
    getMetricsExplorerSegmentFilters,
    isDimension,
    parseMetricValue,
    type MetricExplorerDateRange,
    type MetricQuery,
    type MetricWithAssociatedTimeDimension,
    type ResultRow,
    type SessionUser,
    type TimeDimensionConfig,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import { fromSession } from '../../auth/account';
import type { LightdashConfig } from '../../config/parseConfig';
import { measureTime } from '../../logging/measureTime';
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
        filter: FilterRule | undefined,
    ): Promise<{
        rows: ResultRow[];
        fields: ItemsMap;
        dimension: Dimension;
    }> {
        const oneYearBack = getDateCalcUtils(
            TimeFrames.YEAR,
            timeDimensionConfig.interval,
        ).back;
        const forwardBackDateRange: MetricExplorerDateRange = [
            oneYearBack(dateRange[0]),
            oneYearBack(dateRange[1]),
        ];

        const adjustedMetricQuery: MetricQuery = {
            ...metricQuery,
            filters: {
                dimensions: {
                    id: uuidv4(),
                    and: [
                        ...getMetricExplorerDateRangeFilters(
                            timeDimensionConfig,
                            forwardBackDateRange,
                        ),
                        ...(filter ? [filter] : []),
                    ],
                },
            },
        };

        const { rows, fields } =
            await this.projectService.runMetricExplorerQuery(
                fromSession(user),
                projectUuid,
                exploreName,
                adjustedMetricQuery,
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
        sourceMetricExploreName: string,
        query: MetricExplorerQuery,
        dateRange: MetricExplorerDateRange,
        timeDimensionOverride: TimeDimensionConfig | undefined,
        filter: FilterRule | undefined,
    ): Promise<{
        rows: ResultRow[];
        fields: ItemsMap;
        dimension: Dimension;
        metric: MetricWithAssociatedTimeDimension;
    }> {
        if (query.comparison !== MetricExplorerComparison.DIFFERENT_METRIC) {
            throw new Error('Invalid comparison type');
        }

        if (!query.metric.table || !query.metric.name) {
            throw new Error('Invalid comparison metric');
        }

        const metric = await this.catalogService.getMetric(
            user,
            projectUuid,
            query.metric.table,
            query.metric.name,
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
            exploreName: sourceMetricExploreName, // Query must be run on the source metric explore, this is because of filters and references to source metric explore fields
            metrics: [getItemId(metric)],
            dimensions: [dimensionFieldId],
            filters: {
                dimensions: {
                    id: uuidv4(),
                    and: [
                        ...getMetricExplorerDateRangeFilters(
                            {
                                table: timeDimension.table,
                                field: timeDimension.field,
                                interval: metricDimensionGrain,
                            },
                            dateRange,
                        ),
                        ...(filter ? [filter] : []),
                    ],
                },
            },
            sorts: [
                {
                    fieldId: dimensionFieldId,
                    descending: false,
                },
            ],
            tableCalculations: [],
            limit: this.maxQueryLimit,
        };

        const { rows, fields } =
            await this.projectService.runMetricExplorerQuery(
                fromSession(user),
                projectUuid,
                sourceMetricExploreName,
                metricQuery,
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
        startDate: string,
        endDate: string,
        query: MetricExplorerQuery,
        timeDimensionOverride: TimeDimensionConfig | undefined,
        filter: FilterRule | undefined,
    ): Promise<MetricsExplorerQueryResults> {
        const { result } = await measureTime(
            () =>
                this._runMetricExplorerQuery(
                    user,
                    projectUuid,
                    exploreName,
                    metricName,
                    startDate,
                    endDate,
                    query,
                    timeDimensionOverride,
                    filter,
                ),
            'runMetricExplorerQuery',
            this.logger,
            {
                query,
                startDate,
                endDate,
                timeDimensionOverride,
            },
        );

        return result;
    }

    private async _getTopNSegments(
        user: SessionUser,
        projectUuid: string,
        exploreName: string,
        segmentDimension: string | null,
        metricQuery: MetricQuery,
    ) {
        if (!segmentDimension || !metricQuery.metrics.length) {
            return [];
        }

        const getSegmentsMetricQuery: MetricQuery = {
            ...metricQuery,
            exploreName,
            dimensions: [segmentDimension],
            sorts: [
                {
                    fieldId: metricQuery.metrics[0],
                    descending: true,
                },
            ],
            limit: MAX_SEGMENT_DIMENSION_UNIQUE_VALUES,
            tableCalculations: [],
        };

        const { rows } = await this.projectService.runMetricExplorerQuery(
            fromSession(user),
            projectUuid,
            exploreName,
            getSegmentsMetricQuery,
        );

        return rows.map((row) => row[segmentDimension]);
    }

    private async _runMetricExplorerQuery(
        user: SessionUser,
        projectUuid: string,
        exploreName: string,
        metricName: string,
        startDate: string,
        endDate: string,
        query: MetricExplorerQuery,
        timeDimensionOverride: TimeDimensionConfig | undefined,
        filter: FilterRule | undefined,
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

        const dateRange = getDateRangeFromString([startDate, endDate]);

        const timeDimensionConfig =
            timeDimensionOverride ?? metric.timeDimension;

        if (!timeDimensionConfig) {
            throw new Error('Time dimension not found');
        }

        const dimensionGrain =
            timeDimensionConfig.interval ?? getGrainForDateRange(dateRange);

        const timeDimensionFieldId = getFieldIdForDateDimension(
            timeDimensionConfig.field,
            dimensionGrain,
        );
        const timeDimension = getItemId({
            table: timeDimensionConfig.table,
            name: timeDimensionFieldId,
        });

        const segmentDimensionId =
            query.comparison === MetricExplorerComparison.NONE &&
            query.segmentDimension
                ? query.segmentDimension
                : null;

        const dateFilters = getMetricExplorerDateRangeFilters(
            {
                table: timeDimensionConfig.table,
                field: timeDimensionConfig.field,
                interval: dimensionGrain,
            },
            dateRange,
        );

        const baseQuery: MetricQuery = {
            exploreName,
            dimensions: [
                timeDimension,
                ...(segmentDimensionId ? [segmentDimensionId] : []),
            ],
            metrics: [getItemId(metric)],
            filters: {
                dimensions: {
                    id: uuidv4(),
                    and: dateFilters,
                },
            },
            sorts: [
                {
                    fieldId: timeDimension,
                    descending: false,
                },
            ],
            tableCalculations: [],
            limit: this.maxQueryLimit,
        };

        const segments = await this._getTopNSegments(
            user,
            projectUuid,
            exploreName,
            segmentDimensionId,
            baseQuery,
        );

        const metricQuery: MetricQuery = {
            ...baseQuery,
            filters: {
                ...baseQuery.filters,
                dimensions: {
                    id: uuidv4(),
                    and: [
                        ...dateFilters, // need to add date filters because cannot destructure ".and" without type assertion
                        ...getMetricsExplorerSegmentFilters(
                            segmentDimensionId,
                            segments,
                        ),
                        ...(filter ? [filter] : []),
                    ],
                },
            },
        };

        const { rows: currentResults, fields } =
            await this.projectService.runMetricExplorerQuery(
                fromSession(user),
                projectUuid,
                exploreName,
                metricQuery,
            );

        let allFields = fields;
        let comparisonResults: ResultRow[] | undefined;
        let compareDimension: Dimension | undefined;
        let compareMetric: MetricWithAssociatedTimeDimension | undefined;
        let segmentDimension: Dimension | null = null;

        switch (query.comparison) {
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
                    filter,
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
                    exploreName,
                    query,
                    dateRange,
                    timeDimensionOverride,
                    filter,
                );
                comparisonResults = diffRows;
                allFields = { ...allFields, ...diffFields };
                compareDimension = compDim;
                compareMetric = diffMetric;
                break;
            }
            case MetricExplorerComparison.NONE: {
                if (segmentDimensionId) {
                    const dimension = allFields[segmentDimensionId];
                    if (dimension && isDimension(dimension)) {
                        segmentDimension = dimension;
                    }
                }
                break;
            }
            default: {
                assertUnreachable(query, `Unknown comparison type: ${query}`);
            }
        }

        const baseDimension = allFields[timeDimension];
        if (!baseDimension || !isDimension(baseDimension)) {
            throw new Error('Time dimension not found or invalid');
        }

        let dataPoints: MetricExploreDataPoint[] = [];
        let hasFilteredSeries = false;
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

        if (query.comparison === MetricExplorerComparison.NONE) {
            const {
                dataPoints: metricExplorerDataPoints,
                isSegmentDimensionFiltered,
            } = getMetricExplorerDataPoints(
                baseDimension,
                metricWithTimeDimension,
                currentResults,
                segmentDimensionId,
            );
            dataPoints = metricExplorerDataPoints;
            hasFilteredSeries = isSegmentDimensionFiltered;
        } else {
            if (!comparisonResults) {
                throw new Error(
                    `Comparison results expected for ${query.comparison}`,
                );
            }

            compareDimension = compareDimension || baseDimension;
            const { dataPoints: metricExplorerDataPointsWithCompare } =
                getMetricExplorerDataPointsWithCompare(
                    baseDimension,
                    compareDimension,
                    metricWithTimeDimension,
                    currentResults,
                    comparisonResults,
                    query,
                    timeDimensionConfig.interval,
                );

            dataPoints = metricExplorerDataPointsWithCompare;
        }

        const results = dataPoints
            .map((dp) => ({ ...dp, dateValue: dp.date.valueOf() }))
            .sort((a, b) => a.dateValue - b.dateValue);

        return {
            results,
            fields: allFields,
            metric: metricWithTimeDimension,
            compareMetric: compareMetric ?? null,
            segmentDimension,
            hasFilteredSeries,
        };
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
                ),
            'getMetricTotal',
            this.logger,
            {
                timeFrame,
                comparisonType,
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

        const metricQuery: MetricQuery = {
            exploreName,
            dimensions: [],
            metrics: [getItemId(metric)],
            filters: {
                dimensions: {
                    id: uuidv4(),
                    and: getMetricExplorerDateRangeFilters(
                        metric.timeDimension,
                        dateRange,
                    ),
                },
            },
            sorts: [],
            limit: 1,
            tableCalculations: [],
        };

        const { rows: currentRows } =
            await this.projectService.runMetricExplorerQuery(
                fromSession(user),
                projectUuid,
                exploreName,
                metricQuery,
            );

        let compareRows: Record<string, AnyType>[] | undefined;
        let compareDateRange: MetricExplorerDateRange | undefined;

        if (comparisonType === MetricTotalComparisonType.PREVIOUS_PERIOD) {
            compareDateRange = [
                getDateCalcUtils(timeFrame, granularity).back(dateRange[0]),
                getDateCalcUtils(timeFrame, granularity).back(dateRange[1]),
            ];

            const compareMetricQuery = {
                ...metricQuery,
                filters: {
                    dimensions: {
                        id: uuidv4(),
                        and: getMetricExplorerDateRangeFilters(
                            metric.timeDimension,
                            compareDateRange,
                        ),
                    },
                },
            };

            compareRows = (
                await this.projectService.runMetricExplorerQuery(
                    fromSession(user),
                    projectUuid,
                    exploreName,
                    compareMetricQuery,
                )
            ).rows;
        }

        return {
            value: parseMetricValue(currentRows[0]?.[getItemId(metric)]),
            comparisonValue: parseMetricValue(
                compareRows?.[0]?.[getItemId(metric)],
            ),
            metric,
        };
    }
}
