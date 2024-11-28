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
