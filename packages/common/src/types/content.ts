import type { KnexPaginatedData } from './knex-paginate';
import { type ChartKind } from './savedCharts';

export enum ContentType {
    CHART = 'chart',
    DASHBOARD = 'dashboard',
}

export interface Content {
    contentType: ContentType;
    uuid: string;
    slug: string;
    name: string;
    description: string | null;
    createdAt: Date;
    createdBy: {
        uuid: string;
        firstName: string;
        lastName: string;
    } | null;
    lastUpdatedAt: Date | null;
    lastUpdatedBy: {
        uuid: string;
        firstName: string;
        lastName: string;
    } | null;
    project: {
        uuid: string;
        name: string;
    };
    organization: {
        uuid: string;
        name: string;
    };
    space: {
        uuid: string;
        name: string;
    };
    pinnedList: {
        uuid: string;
    } | null;
    views: number;
    firstViewedAt: Date | null;
}

// Chart types

export enum ChartSourceType {
    DBT_EXPLORE = 'dbt_explore',
    SQL = 'sql',
    SEMANTIC_LAYER = 'semantic_layer',
}

export interface ChartContent extends Content {
    contentType: ContentType.CHART;
    source: ChartSourceType;
    chartKind: ChartKind;
    dashboard: {
        uuid: string;
        name: string;
    } | null;
}

// Dashboard types

export interface DashboardContent extends Content {
    contentType: ContentType.DASHBOARD;
}

// Group types

export type SummaryContent = ChartContent | DashboardContent; // Note: more types will be added.

// API types

export type ApiContentResponse = {
    status: 'ok';
    results: KnexPaginatedData<SummaryContent[]>;
};

export type ApiChartContentResponse = {
    status: 'ok';
    results: KnexPaginatedData<ChartContent[]>;
};
