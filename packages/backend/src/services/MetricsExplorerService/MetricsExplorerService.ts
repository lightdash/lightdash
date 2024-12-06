import { subject } from '@casl/ability';
import {
    assertUnreachable,
    ForbiddenError,
    getFieldIdForDateDimension,
    getGrainForDateRange,
    getItemId,
    getMetricExplorerDateRangeFilters,
    MetricExplorerComparison,
    MetricExplorerComparisonType,
    oneYearBack,
    type MetricExplorerDateRange,
    type MetricQuery,
    type MetricsExplorerQueryResults,
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

    async runMetricExplorerQuery(
        user: SessionUser,
        projectUuid: string,
        exploreName: string,
        metricName: string,
        dateRange: MetricExplorerDateRange,
        compare: MetricExplorerComparisonType | undefined,
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

        if (!timeDimensionConfig) {
            throw new Error(
                `Metric ${metricName} does not have a valid time dimension`,
            );
        }

        const dimensionGrain = timeDimensionConfig.interval;

        const timeDimension = getItemId({
            table: timeDimensionConfig.table,
            name: getFieldIdForDateDimension(
                timeDimensionConfig.field,
                dimensionGrain,
            ),
        });

        const metricQuery: MetricQuery = {
            exploreName,
            dimensions: [timeDimension],
            metrics: [getItemId(metric)],
            filters: {
                dimensions: {
                    id: uuidv4(),
                    and: getMetricExplorerDateRangeFilters(
                        timeDimensionConfig.table,
                        timeDimensionConfig.field,
                        dateRange,
                    ),
                },
            },
            sorts: [
                {
                    fieldId: timeDimension,
                    descending: false,
                },
            ],
            tableCalculations: [],
            limit: this.maxQueryLimit, // TODO: are we sure we want to limit this with the max query limit?
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
        let compareMetric: MetricWithAssociatedTimeDimension | undefined;

        if (compare) {
            switch (compare.type) {
                case MetricExplorerComparison.NONE:
                    break;
                case MetricExplorerComparison.PREVIOUS_PERIOD:
                    const previousDateRange: MetricExplorerDateRange = [
                        oneYearBack(dateRange[0]),
                        oneYearBack(dateRange[1]),
                    ];

                    const previousPeriodMetricQuery: MetricQuery = {
                        ...metricQuery,
                        filters: {
                            dimensions: {
                                id: uuidv4(),
                                and: getMetricExplorerDateRangeFilters(
                                    timeDimensionConfig.table,
                                    timeDimensionConfig.field,
                                    previousDateRange,
                                ),
                            },
                        },
                    };

                    const {
                        rows: comparisonResultRows,
                        fields: comparisonFields,
                    } = await this.projectService.runExploreQuery(
                        user,
                        previousPeriodMetricQuery,
                        projectUuid,
                        exploreName,
                        null,
                    );

                    comparisonResults = comparisonResultRows;
                    allFields = { ...allFields, ...comparisonFields };

                    break;
                case MetricExplorerComparison.DIFFERENT_METRIC:
                    compareMetric = await this.catalogService.getMetric(
                        user,
                        projectUuid,
                        compare.metricTable,
                        compare.metricName,
                        timeDimensionOverride?.interval,
                    );

                    const compareTimeDimension = compareMetric.timeDimension;

                    if (!compareTimeDimension) {
                        throw new Error(
                            `Comparison metric should always have an associated time dimension`,
                        );
                    }

                    const compareMetricDimensionGrain = timeDimensionOverride
                        ? timeDimensionOverride.interval
                        : compareTimeDimension.interval;

                    const differentDimensionId = getItemId({
                        table: compareTimeDimension.table,
                        name: getFieldIdForDateDimension(
                            compareTimeDimension.field,
                            compareMetricDimensionGrain,
                        ),
                    });

                    const differentMetricQuery: MetricQuery = {
                        exploreName: compare.metricTable,
                        metrics: [getItemId(compareMetric)],
                        dimensions: [differentDimensionId],
                        filters: {
                            dimensions: {
                                id: uuidv4(),
                                and: getMetricExplorerDateRangeFilters(
                                    compareTimeDimension.table,
                                    compareTimeDimension.field,
                                    dateRange,
                                ),
                            },
                        },
                        sorts: [
                            {
                                fieldId: differentDimensionId,
                                descending: false,
                            },
                        ],
                        tableCalculations: [],
                        limit: this.maxQueryLimit, // TODO: are we sure we want to limit this with the max query limit?
                    };

                    const {
                        rows: differentMetricResultRows,
                        fields: differentMetricFields,
                    } = await this.projectService.runExploreQuery(
                        user,
                        differentMetricQuery,
                        projectUuid,
                        compare.metricTable,
                        null,
                    );

                    comparisonResults = differentMetricResultRows;
                    allFields = { ...allFields, ...differentMetricFields };

                    break;
                default:
                    assertUnreachable(
                        compare,
                        `Unknown comparison type: ${compare}`,
                    );
                    break;
            }
        }

        return {
            rows: currentResults,
            comparisonRows: comparisonResults,
            fields: allFields,
            metric: { ...metric, timeDimension: timeDimensionConfig },
            comparisonMetric: compareMetric,
        };
    }
}
