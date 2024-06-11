import { type DashboardDAO } from './dashboard';
import { type SavedChartDAO } from './savedCharts';
import { type SpaceSummary } from './space';

export enum PromotionAction {
    NO_CHANGES = 'no changes',
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
}

export type PromotedSpace = Omit<SpaceSummary, 'userAccess'>;
export type PromotedDashboard = DashboardDAO & {
    spaceSlug: string;
};
export type PromotedChart = SavedChartDAO & { spaceSlug: string };

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
