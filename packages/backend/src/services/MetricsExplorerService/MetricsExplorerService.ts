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
    type ResultRow,
    type SessionUser,
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

        const { defaultTimeDimension } = metric;
        if (!defaultTimeDimension) {
            throw new Error(
                `Metric ${metricName} does not have a default time dimension`,
            );
        }

        const dimensionGrain = dateRange
            ? getGrainForDateRange(dateRange)
            : defaultTimeDimension.interval;

        const timeDimension = getItemId({
            table: metric.table,
            name: getFieldIdForDateDimension(
                defaultTimeDimension.field,
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
                        exploreName,
                        defaultTimeDimension.field,
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
                                    exploreName,
                                    defaultTimeDimension.field,
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
                    throw new Error('Not implemented');
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
        };
    }
}
