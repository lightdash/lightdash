import {
    getErrorMessage,
    getPreAggregateExploreName,
    isExploreError,
    ItemsMap,
    MetricQuery,
    ParameterDefinitions,
    ParametersValuesMap,
    PivotConfiguration,
    SupportedDbtAdapter,
    UserAccessControls,
    WarehouseClient,
    type CreateWarehouseCredentials,
    type DateZoom,
} from '@lightdash/common';
import {
    DuckdbS3SessionConfig,
    DuckdbWarehouseClient,
    warehouseSqlBuilderFromType,
} from '@lightdash/warehouses';
import { type LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { type PreAggregateModel } from '../../models/PreAggregateModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { wrapSentryTransaction } from '../../utils';
import { PivotQueryBuilder } from '../../utils/QueryBuilder/PivotQueryBuilder';
import {
    getDuckdbPreAggregateSqlTable,
    getPreAggregateDuckdbLocator,
} from '../PreAggregateMaterializationService/getDuckdbPreAggregateSqlTable';
import { ProjectService } from '../ProjectService/ProjectService';
import { getDuckdbRuntimeConfig } from './getDuckdbRuntimeConfig';
import { type PreAggregationRoute } from './types';

type PreAggregationDuckDbClientArgs = {
    lightdashConfig: LightdashConfig;
    preAggregateModel: Pick<PreAggregateModel, 'getActiveMaterialization'>;
    projectModel: Pick<ProjectModel, 'getExploreFromCache'>;
    createDuckdbWarehouseClient?: (args: {
        s3Config: DuckdbS3SessionConfig;
    }) => WarehouseClient;
};

export type ResolvePreAggregationDuckDbArgs = {
    projectUuid: string;
    metricQuery: MetricQuery;
    dateZoom: DateZoom | undefined;
    parameters: ParametersValuesMap | undefined;
    preAggregationRoute: PreAggregationRoute;
    fieldsMap: ItemsMap;
    pivotConfiguration: PivotConfiguration | undefined;
    startOfWeek: CreateWarehouseCredentials['startOfWeek'];
    userAccessControls: UserAccessControls;
    availableParameterDefinitions: ParameterDefinitions;
};

export type PreAggregationDuckDbResolution =
    | { resolved: false; reason: string }
    | { resolved: true; query: string; warehouseClient: WarehouseClient };

export class PreAggregationDuckDbClient {
    private readonly lightdashConfig: LightdashConfig;

    private readonly preAggregateModel: Pick<
        PreAggregateModel,
        'getActiveMaterialization'
    >;

    private readonly projectModel: Pick<ProjectModel, 'getExploreFromCache'>;

    private readonly createDuckdbWarehouseClient: (args: {
        s3Config: DuckdbS3SessionConfig;
    }) => WarehouseClient;

    constructor(args: PreAggregationDuckDbClientArgs) {
        this.lightdashConfig = args.lightdashConfig;
        this.preAggregateModel = args.preAggregateModel;
        this.projectModel = args.projectModel;
        this.createDuckdbWarehouseClient =
            args.createDuckdbWarehouseClient ??
            ((warehouseArgs) =>
                DuckdbWarehouseClient.createForPreAggregate(warehouseArgs));
    }

    async resolve(
        args: ResolvePreAggregationDuckDbArgs,
    ): Promise<PreAggregationDuckDbResolution> {
        try {
            const result = await wrapSentryTransaction(
                'PreAggregationDuckDbClient.resolve',
                {},
                () => this._resolve(args),
            );

            if (!result.resolved) {
                Logger.info(`DuckDB pre-agg skipped: ${result.reason}`);
            }

            return result;
        } catch (error) {
            Logger.warn(
                `DuckDB pre-agg resolve failed: ${getErrorMessage(error)}. Returning unresolved`,
            );
            return { resolved: false, reason: 'resolve_error' };
        }
    }

    private async _resolve(
        args: ResolvePreAggregationDuckDbArgs,
    ): Promise<PreAggregationDuckDbResolution> {
        if (!this.lightdashConfig.preAggregates.enabled) {
            return { resolved: false, reason: 'pre_aggregates_disabled' };
        }

        const resultsBucket = this.lightdashConfig.results.s3?.bucket;
        if (!resultsBucket) {
            return {
                resolved: false,
                reason: 'missing_results_s3_bucket',
            };
        }

        const duckdbRuntimeConfig = getDuckdbRuntimeConfig(
            this.lightdashConfig,
        );
        if (!duckdbRuntimeConfig) {
            return {
                resolved: false,
                reason: 'missing_duckdb_runtime_config',
            };
        }

        const preAggExploreName = getPreAggregateExploreName(
            args.preAggregationRoute.sourceExploreName,
            args.preAggregationRoute.preAggregateName,
        );

        const activeMaterialization =
            await this.preAggregateModel.getActiveMaterialization(
                args.projectUuid,
                preAggExploreName,
            );

        if (!activeMaterialization) {
            return {
                resolved: false,
                reason: 'no_active_materialization',
            };
        }

        const locator = getPreAggregateDuckdbLocator({
            bucket: resultsBucket,
            resultsFileName: activeMaterialization.resultsFileName,
            format: 'jsonl',
        });
        const sqlTable = getDuckdbPreAggregateSqlTable(
            locator,
            activeMaterialization.columns,
        );

        const preAggExplore = await this.projectModel.getExploreFromCache(
            args.projectUuid,
            preAggExploreName,
        );

        if (isExploreError(preAggExplore)) {
            throw new Error(
                `Pre-aggregate explore ${preAggExploreName} is not queryable`,
            );
        }

        const patchedPreAggExplore = {
            ...preAggExplore,
            tables: Object.fromEntries(
                Object.entries(preAggExplore.tables).map(
                    ([tableName, table]) => [
                        tableName,
                        {
                            ...table,
                            sqlTable,
                        },
                    ],
                ),
            ),
        };

        const warehouseSqlBuilder = warehouseSqlBuilderFromType(
            SupportedDbtAdapter.DUCKDB,
            args.startOfWeek,
        );

        const fullQuery = await ProjectService._compileQuery({
            metricQuery: args.metricQuery,
            explore: patchedPreAggExplore,
            warehouseSqlBuilder,
            intrinsicUserAttributes:
                args.userAccessControls.intrinsicUserAttributes,
            userAttributes: args.userAccessControls.userAttributes,
            timezone: this.lightdashConfig.query.timezone || 'UTC',
            dateZoom: args.dateZoom,
            parameters: args.parameters,
            availableParameterDefinitions: args.availableParameterDefinitions,
            pivotConfiguration: args.pivotConfiguration,
        });

        let { query } = fullQuery;
        if (args.pivotConfiguration) {
            const pivotQueryBuilder = new PivotQueryBuilder(
                fullQuery.query,
                args.pivotConfiguration,
                warehouseSqlBuilder,
                args.metricQuery.limit,
                args.fieldsMap,
            );

            query = pivotQueryBuilder.toSql({
                columnLimit: this.lightdashConfig.pivotTable.maxColumnLimit,
            });
        }

        const warehouseClient = this.createDuckdbWarehouseClient({
            s3Config: duckdbRuntimeConfig,
        });

        return {
            resolved: true,
            query,
            warehouseClient,
        };
    }
}
