import type { ComposerStoredChart } from '../composer/composerChart';
import type { ApiSuccess } from './api/success';
import { type DashboardDAO } from './dashboard';
import type { Document } from './document';
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

/** The pipeline stays server side; only the chart travels in a diff. */
export type PromotedComposerChart = {
    uuid: string;
    oldUuid: string;
    slug: string;
    projectUuid: string;
    name: string;
    description: string | null;
    chart: ComposerStoredChart;
    /** Path of the space that owns the chart; null when the dashboard owns it. */
    spacePath: string | null;
};

export type PromotedApp = {
    uuid: string;
    name: string;
};

export type PromotedDocument = {
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
    composerCharts?: {
        action: PromotionAction;
        data: PromotedComposerChart;
    }[];
    // Apps the promotion carries along: data apps referenced by DATA_APP
    // dashboard tiles, and custom chart types bound by charts' DATA_APP_VIZ
    // configs. SQL charts never carry apps.
    dataApps?: {
        action: PromotionAction;
        data: PromotedApp;
    }[];
    documents?: {
        action: PromotionAction;
        data: PromotedDocument;
    }[];
};

export type ApiPromoteDocumentResponse = ApiSuccess<Document>;

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
