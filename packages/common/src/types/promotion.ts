import { type DashboardDAO } from './dashboard';
import { type SavedChartDAO } from './savedCharts';
import { type SpaceSummaryBase } from './space';

export enum PromotionAction {
    NO_CHANGES = 'no changes',
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
}

export type PromotedSpace = SpaceSummaryBase;

export type PromotedDashboard = DashboardDAO & {
    spaceSlug: string;
    spacePath: string;
};
export type PromotedChart = SavedChartDAO & {
    spaceSlug: string;
    spacePath: string;
    oldUuid: string;
};

export type PromotedSqlChart = {
    uuid: string;
    oldUuid: string;
    slug: string;
    projectUuid: string;
    name: string;
    description: string | null;
    spaceSlug: string;
    spacePath: string;
};

export type PromotedApp = {
    uuid: string;
    name: string;
};

export type PromotionChanges = {
    spaces: {
        action: PromotionAction;
        data: PromotedSpace;
    }[];
    dashboards: {
        action: PromotionAction;
        data: PromotedDashboard;
    }[];
    charts: {
        action: PromotionAction;
        data: PromotedChart;
    }[];
    sqlCharts?: {
        action: PromotionAction;
        data: PromotedSqlChart;
    }[];
    // Data apps referenced by DATA_APP dashboard tiles. Only populated for
    // dashboard promotion; charts/SQL charts never carry apps.
    dataApps?: {
        action: PromotionAction;
        data: PromotedApp;
    }[];
};

export type ApiPromoteChartResponse = {
    status: 'ok';
    results: SavedChartDAO;
};

export type ApiPromoteDashboardResponse = {
    status: 'ok';
    results: DashboardDAO;
};

export type ApiPromotionChangesResponse = {
    status: 'ok';
    results: PromotionChanges;
};
