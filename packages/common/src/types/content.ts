import { type ChartKind } from './savedCharts';

export interface Content {
    resourceType: 'chart'; // Note: more types will be added. 'dashboard' | 'chart' | 'notebook' | 'report';
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
    lastUpdatedAt: Date;
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
}

// Chart types

export interface ChartContent extends Content {
    resourceType: 'chart';
    source: 'dbt_explore' | 'sql';
    chartKind: ChartKind;
    dashboard: {
        uuid: string;
        name: string;
    } | null;
}

// Group types

export type SummaryContent = ChartContent; // Note: more types will be added.

// API types

export type ApiChartContentResponse = {
    status: 'ok';
    results: ChartContent[];
};
