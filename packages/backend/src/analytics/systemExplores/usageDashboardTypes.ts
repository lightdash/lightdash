import type {
    ChartAsCode,
    DashboardAsCode,
    FilterOperator,
} from '@lightdash/common';
import type { analyticsExploreNames } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';

export type AnalyticsContentBundle = {
    dashboard: DashboardAsCode;
    charts: ChartAsCode[];
};

export type UsageChartSpec = {
    key: string;
    name: string;
    description: string;
    explore: (typeof analyticsExploreNames)[number];
    dimensions: string[];
    metrics: string[];
    limit: number;
    sorts: ChartAsCode['metricQuery']['sorts'];
    filters?: {
        field: string;
        values: (string | boolean)[];
        operator?: FilterOperator;
    }[];
    tableCalculations?: ChartAsCode['metricQuery']['tableCalculations'];
    fieldLabels?: Record<string, string>;
    visualization?: 'number' | 'line' | 'bar' | 'scatter' | 'donut';
    xField?: string;
    yFields?: string[];
    flipAxes?: boolean;
};

export type UsageDashboardSpec = {
    key: string;
    name: string;
    description: string;
    tabs: {
        key: string;
        name: string;
        sections: {
            title: string;
            description: string;
            charts: string[];
        }[];
    }[];
};
