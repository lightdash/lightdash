import {
    ApiPreAggregateStatsResults,
    CreateWarehouseCredentials,
    DateZoom,
    ItemsMap,
    ParameterDefinitions,
    ParametersValuesMap,
    PivotConfiguration,
    UserAccessControls,
    WarehouseClient,
    type CacheMetadata,
    type Explore,
    type KnexPaginateArgs,
    type KnexPaginatedData,
    type MetricQuery,
    type QueryExecutionContext,
} from '@lightdash/common';
import { type S3ResultsFileStorageClient } from '../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { type PreAggregationRoute } from './types';

export type PreAggregationRoutingDecision =
    | {
          target: 'warehouse';
          preAggregateMetadata?: CacheMetadata['preAggregate'];
      }
    | {
          target: 'pre_aggregate';
          preAggregateMetadata: CacheMetadata['preAggregate'];
          route: PreAggregationRoute;
      }
    | {
          target: 'materialization';
          preAggregateMetadata?: CacheMetadata['preAggregate'];
      };

export type PreAggregateStatsFilters = {
    exploreName?: string;
    queryType?: 'chart' | 'dashboard' | 'explorer';
};

export interface PreAggregateStrategy {
    getRoutingDecision(params: {
        projectUuid: string;
        metricQuery: MetricQuery;
        explore: Explore;
        context: QueryExecutionContext;
    }): Promise<PreAggregationRoutingDecision>;

    resolveExecution(params: {
        projectUuid: string;
        queryUuid: string;
        warehouseQuery: string;
        preAggregationRoute: PreAggregationRoute;
        resolveArgs: ResolveExecutionArgs;
    }): Promise<PreAggregateExecutionResolution>;

    createExecutionWarehouseClient(): WarehouseClient;

    recordStats(params: {
        projectUuid: string;
        exploreName: string;
        routingDecision: PreAggregationRoutingDecision;
        chartUuid: string | null;
        dashboardUuid: string | null;
        queryContext: string;
    }): void;

    cleanupStats(retentionDays: number): Promise<number>;

    getStats(
        projectUuid: string,
        days: number,
        paginateArgs?: KnexPaginateArgs,
        filters?: PreAggregateStatsFilters,
    ): Promise<KnexPaginatedData<ApiPreAggregateStatsResults>>;

    getResultsStorageClient(): S3ResultsFileStorageClient | undefined;
}

export type ResolveExecutionArgs = {
    metricQuery: MetricQuery;
    timezone: string;
    dateZoom: DateZoom | undefined;
    parameters: ParametersValuesMap | undefined;
    fieldsMap: ItemsMap;
    pivotConfiguration: PivotConfiguration | undefined;
    startOfWeek: CreateWarehouseCredentials['startOfWeek'];
    userAccessControls?: UserAccessControls;
    availableParameterDefinitions?: ParameterDefinitions;
};

export type PreAggregateExecutionResolution =
    | { resolved: true; query: string }
    | { resolved: false; reason: string; isFatal: boolean };

/* eslint-disable class-methods-use-this */
export class NoOpPreAggregateStrategy implements PreAggregateStrategy {
    async getRoutingDecision(): Promise<PreAggregationRoutingDecision> {
        return { target: 'warehouse' };
    }

    async resolveExecution(): Promise<PreAggregateExecutionResolution> {
        return { resolved: false, reason: 'not_available', isFatal: false };
    }

    createExecutionWarehouseClient(): never {
        throw new Error(
            'Pre-aggregate execution is not available in this edition',
        );
    }

    recordStats(): void {
        // no-op
    }

    async cleanupStats(): Promise<number> {
        return 0;
    }

    async getStats(
        _projectUuid: string,
        _days: number,
        paginateArgs?: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<ApiPreAggregateStatsResults>> {
        return {
            data: { stats: [] },
            pagination: {
                page: paginateArgs?.page ?? 1,
                pageSize: paginateArgs?.pageSize ?? 0,
                totalResults: 0,
                totalPageCount: 0,
            },
        };
    }

    getResultsStorageClient(): undefined {
        return undefined;
    }
}
