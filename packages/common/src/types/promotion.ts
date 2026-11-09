import type { ApiSuccess } from './api/success';
import { type DashboardDAO } from './dashboard';
import type { Document } from './document';
import {
    type ComposerSavedChartDAO,
    type SavedChartDAO,
    type SkippedChart,
} from './savedCharts';
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

/** A composer chart written by a content-as-code upload; promotion does not carry pipelines yet. */
export type PromotedComposerChart = ComposerSavedChartDAO & {
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
    /** Composer charts a content-as-code upload wrote; listed apart from charts, which promotion writes as classic versions. */
    composerCharts?: {
        action: PromotionAction;
        data: PromotedComposerChart;
    }[];
    sqlCharts?: {
        action: PromotionAction;
        data: PromotedSqlChart;
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
    /** Charts the promotion left out by name, such as composer charts until promotion carries pipelines. */
    skippedCharts?: SkippedChart[];
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
