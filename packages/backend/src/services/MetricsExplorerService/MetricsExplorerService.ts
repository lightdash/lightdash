import { subject } from '@casl/ability';
import {
    assertUnreachable,
    ForbiddenError,
    getItemId,
    getMetricExplorerDimensionCurrentFilters,
    getMetricExplorerDimensionPreviousFilters,
    MetricExplorerComparison,
    MetricExplorerComparisonType,
    type MetricQuery,
    type MetricsExplorerQueryResults,
    type ResultRow,
    type SessionUser,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../BaseService';
import { CatalogService } from '../CatalogService/CatalogService';
import type { ProjectService } from '../ProjectService/ProjectService';

export type MetricsExplorerArguments<T extends CatalogModel = CatalogModel> = {
    catalogModel: T;
    projectModel: ProjectModel;
    catalogService: CatalogService;
    projectService: ProjectService;
};

export class MetricsExplorerService<
    T extends CatalogModel = CatalogModel,
> extends BaseService {
    catalogModel: T;

    projectModel: ProjectModel;

    catalogService: CatalogService;

    projectService: ProjectService;

    constructor({
        catalogModel,
        catalogService,
        projectModel,
        projectService,
    }: MetricsExplorerArguments<T>) {
        super();
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

        if (!metric.defaultTimeDimension) {
            throw new Error(
                `Metric ${metricName} does not have a default time dimension`,
            );
        }

        const filters = getMetricExplorerDimensionCurrentFilters(
            exploreName,
            metric.defaultTimeDimension.field,
            metric.defaultTimeDimension.interval,
        );

        const metricQuery: MetricQuery = {
            exploreName,
            dimensions: [
                getItemId({
                    table: metric.table,
                    name: metric.defaultTimeDimension.field,
                }),
            ],
            metrics: [getItemId(metric)],
            filters: {
                dimensions: {
                    id: uuidv4(),
                    or: filters,
                },
            },
            sorts: [
                {
                    fieldId: getItemId({
                        table: metric.table,
                        name: metric.defaultTimeDimension.field,
                    }),
                    descending: false,
                },
            ],
            tableCalculations: [],
            limit: 100,
        };

        const { rows: currentResult } =
            await this.projectService.runExploreQuery(
                user,
                metricQuery,
                projectUuid,
                exploreName,
                null,
            );

        let comparisonResult: ResultRow[] | undefined;
        if (compare) {
            switch (compare.type) {
                case MetricExplorerComparison.PREVIOUS_PERIOD:
                    const previousPeriodMetricQuery: MetricQuery = {
                        ...metricQuery,
                        filters: {
                            dimensions: {
                                id: uuidv4(),
                                and: getMetricExplorerDimensionPreviousFilters(
                                    exploreName,
                                    metric.defaultTimeDimension.field,
                                    metric.defaultTimeDimension.interval,
                                ),
                            },
                        },
                    };

                    const { rows: previousPeriodResult } =
                        await this.projectService.runExploreQuery(
                            user,
                            previousPeriodMetricQuery,
                            projectUuid,
                            exploreName,
                            null,
                        );

                    comparisonResult = previousPeriodResult;

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

        return { rows: currentResult, comparisonRows: comparisonResult };
    }
}
