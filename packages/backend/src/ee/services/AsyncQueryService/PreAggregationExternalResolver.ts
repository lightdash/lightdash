import {
    getErrorMessage,
    getPreAggregateExploreName,
    isExploreError,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { type LightdashConfig } from '../../../config/parseConfig';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../../services/BaseService';
import { traceSpan } from '../../../tracing/tracing';
import { QueryComposer } from '../../../utils/QueryBuilder/QueryComposer';
import {
    PreAggregationDuckDbResolveReason,
    type ResolvePreAggregationDuckDbArgs,
} from './PreAggregationDuckDbClient';

type PreAggregationExternalResolverArgs = {
    lightdashConfig: LightdashConfig;
    projectModel: Pick<ProjectModel, 'getExploreFromCache'>;
};

export type PreAggregationExternalResolution =
    | { resolved: false; reason: PreAggregationDuckDbResolveReason }
    | { resolved: true; query: string };

/**
 * Resolves serving for external pre-aggregates: the generated explore already
 * has the external table baked into sqlTable and is compiled in the project
 * warehouse dialect, so the matched query runs on the normal project
 * warehouse client (no DuckDB, no materialization).
 */
export class PreAggregationExternalResolver extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly projectModel: Pick<ProjectModel, 'getExploreFromCache'>;

    constructor(args: PreAggregationExternalResolverArgs) {
        super({ serviceName: 'PreAggregationExternalResolver' });
        this.lightdashConfig = args.lightdashConfig;
        this.projectModel = args.projectModel;
    }

    async resolve(
        args: ResolvePreAggregationDuckDbArgs,
    ): Promise<PreAggregationExternalResolution> {
        try {
            return await this._resolve(args);
        } catch (error) {
            this.logger.warn(
                `External pre-agg resolve failed: ${getErrorMessage(error)}. Returning unresolved`,
            );
            return {
                resolved: false,
                reason: PreAggregationDuckDbResolveReason.RESOLVE_ERROR,
            };
        }
    }

    private async _resolve(
        args: ResolvePreAggregationDuckDbArgs,
    ): Promise<PreAggregationExternalResolution> {
        if (!this.lightdashConfig.preAggregates.enabled) {
            return {
                resolved: false,
                reason: PreAggregationDuckDbResolveReason.PRE_AGGREGATES_DISABLED,
            };
        }

        const preAggExploreName = getPreAggregateExploreName(
            args.preAggregationRoute.sourceExploreName,
            args.preAggregationRoute.preAggregateName,
        );

        const preAggExplore = await traceSpan(
            {
                op: 'cache.read',
                name: 'preagg.getExploreFromCache',
                attributes: {
                    'lightdash.projectUuid': args.projectUuid,
                    'lightdash.preAggExploreName': preAggExploreName,
                },
            },
            () =>
                this.projectModel.getExploreFromCache(
                    args.projectUuid,
                    preAggExploreName,
                ),
        );

        if (isExploreError(preAggExplore)) {
            throw new Error(
                `Pre-aggregate explore ${preAggExploreName} is not queryable`,
            );
        }

        const externalTable = preAggExplore.preAggregateSource?.externalTable;
        if (!externalTable) {
            throw new Error(
                `Pre-aggregate explore ${preAggExploreName} has no external table (stale explore cache?)`,
            );
        }

        this.logger.info('External pre-agg table selected', {
            queryUuid: args.queryUuid,
            projectUuid: args.projectUuid,
            queryContext: args.queryTags?.query_context,
            exploreName: args.queryTags?.explore_name,
            preAggExploreName,
            externalTable,
        });

        const warehouseSqlBuilder = warehouseSqlBuilderFromType(
            preAggExplore.targetDatabase,
            args.startOfWeek,
        );

        const queryComposer = new QueryComposer(
            {
                metricQuery: args.metricQuery,
                pivotConfiguration: args.pivotConfiguration,
            },
            {
                explore: preAggExplore,
                warehouseSqlBuilder,
                intrinsicUserAttributes:
                    args.userAccessControls.intrinsicUserAttributes,
                userAttributes: args.userAccessControls.userAttributes,
                timezone: args.timezone,
                availableParameterDefinitions:
                    args.availableParameterDefinitions,
                parameters: args.parameters,
                dateZoom: args.dateZoom,
                pivotDimensions: undefined,
                // Pre-agg pivots against the source query's persisted fields,
                // not the pre-agg explore's freshly compiled ones.
                pivotItemsMap: args.fieldsMap,
                continueOnError: undefined,
                useTimezoneAwareDateTrunc: args.useTimezoneAwareDateTrunc,
                columnTimezone: undefined,
                applyDateZoomToFilters: undefined,
            },
        );

        const query = traceSpan(
            {
                op: 'function',
                name: 'preagg.compileQuery',
            },
            () =>
                queryComposer.getSql({
                    columnLimit: this.lightdashConfig.pivotTable.maxColumnLimit,
                }),
        );

        return { resolved: true, query };
    }
}
