import type {
    ChartAsCode,
    DashboardAsCode,
    DateFilterSettings,
    FilterOperator,
} from '@lightdash/common';
import type { analyticsExploreNames } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import type { LibraryChartBinding } from './libraryCharts';

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
        values: (string | boolean | number)[];
        operator?: FilterOperator;
        settings?: DateFilterSettings;
    }[];
    timezone?: string;
    tableCalculations?: ChartAsCode['metricQuery']['tableCalculations'];
    fieldLabels?: Record<string, string>;
    visualization?: 'number' | 'line' | 'bar' | 'scatter' | 'donut';
    xField?: string;
    yFields?: string[];
    flipAxes?: boolean;
    // Keeps only the categories with the largest totals of a summed metric, for charts that draw one row
    // or column per category. Not for distinct counts: their totals over days mean nothing.
    topCategories?: { category: string; metric: string; count: number };
    libraryChart?: LibraryChartBinding;
};

export type UsageDashboardSpec = {
    key: string;
    name: string;
    description: string;
    filters?: DashboardAsCode['filters'];
    tabs: {
        key: string;
        name: string;
        sections: {
            title: string;
            description: string;
            caption?: true;
            // false leaves out the text above the tiles, for tiles that explain themselves
            note?: false;
            layout?: 'row';
            rowHeight?: number;
            // Grid columns per chart of a row, summing to 36. Without it the row is split evenly
            widths?: number[];
            charts: string[];
        }[];
    }[];
};
