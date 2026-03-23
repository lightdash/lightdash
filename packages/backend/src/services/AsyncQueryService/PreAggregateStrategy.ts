import {
    ApiPreAggregateStatsResults,
    type CacheMetadata,
    type Explore,
    type KnexPaginateArgs,
    type KnexPaginatedData,
    type MetricQuery,
    type QueryExecutionContext,
} from '@lightdash/common';
import { type S3ResultsFileStorageClient } from '../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import {
    type PreAggregationRoute,
    type RunAsyncPreAggregateQueryArgs,
} from './types';

export type PreAggregationRoutingDecision =
    | {
          target: 'warehouse';
          preAggregateMetadata?: CacheMetadata['preAggregate'];
      }
    | {
          target: 'pre_aggregate';
          preAggregateMetadata: CacheMetadata['preAggregate'];
          route: PreAggregationRoute;
      };

export type PreAggregateStatsFilters = {
    exploreName?: string;
    queryType?: 'chart' | 'dashboard' | 'explorer';
};

export interface PreAggregateStrategy {
    getRoutingDecision(params: {
        metricQuery: MetricQuery;
        explore: Explore;
        context: QueryExecutionContext;
    }): PreAggregationRoutingDecision;

    resolveExecution(params: {
        projectUuid: string;
        queryUuid: string;
        warehouseQuery: string;
        preAggregationRoute: PreAggregationRoute;
        resolveArgs: ResolveExecutionArgs;
    }): Promise<PreAggregateExecutionResolution>;

    createExecutionWarehouseClient(): import('@lightdash/common').WarehouseClient;

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
    dateZoom: import('@lightdash/common').DateZoom | undefined;
    parameters: import('@lightdash/common').ParametersValuesMap | undefined;
    fieldsMap: import('@lightdash/common').ItemsMap;
    pivotConfiguration:
        | import('@lightdash/common').PivotConfiguration
        | undefined;
    startOfWeek: import('@lightdash/common').CreateWarehouseCredentials['startOfWeek'];
    userAccessControls?: import('@lightdash/common').UserAccessControls;
    availableParameterDefinitions?: import('@lightdash/common').ParameterDefinitions;
};

export type PreAggregateExecutionResolution =
    | { resolved: true; query: string }
    | { resolved: false; reason: string; isFatal: boolean };

/* eslint-disable class-methods-use-this */
export class NoOpPreAggregateStrategy implements PreAggregateStrategy {
    getRoutingDecision(): PreAggregationRoutingDecision {
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
