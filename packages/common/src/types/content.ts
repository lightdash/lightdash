import type { KnexPaginatedData } from './knex-paginate';
import { type ChartKind } from './savedCharts';
import { type SessionUser } from './user';

export enum ContentType {
    CHART = 'chart',
    DASHBOARD = 'dashboard',
    SPACE = 'space',
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

export enum ContentSortByColumns {
    NAME = 'name',
    SPACE_NAME = 'space_name',
    LAST_UPDATED_AT = 'last_updated_at',
}

// Chart types

export enum ChartSourceType {
    DBT_EXPLORE = 'dbt_explore',
    SQL = 'sql',
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

export interface SpaceContent extends Content {
    contentType: ContentType.SPACE;
    isPrivate: boolean;
    access: string[];
    dashboardCount: number;
    chartCount: number;
    pinnedList: {
        uuid: string;
        order: number;
    } | null;
    parentSpaceUuid: string | null;
    path: string;
}

// Group types

export type SummaryContent = ChartContent | DashboardContent | SpaceContent; // Note: more types will be added.

// API types

export type ApiContentResponse = {
    status: 'ok';
    results: KnexPaginatedData<SummaryContent[]>;
};

export type ApiChartContentResponse = {
    status: 'ok';
    results: KnexPaginatedData<ChartContent[]>;
};

export type ContentActionMove = {
    type: 'move';
    targetSpaceUuid: string | null;
};

export type ContentActionDelete = {
    type: 'delete';
};

type ItemPayload =
    | {
          uuid: string;
          contentType: ContentType.CHART;
          source: ChartSourceType;
      }
    | {
          uuid: string;
          contentType: ContentType.DASHBOARD;
      }
    | {
          uuid: string;
          contentType: ContentType.SPACE;
      };

export type ContentAction = ContentActionMove | ContentActionDelete;

export type ApiContentActionBody<T extends ContentAction = ContentAction> = {
    item: ItemPayload;
    action: T;
};

export type ApiContentBulkActionBody<T extends ContentAction = ContentAction> =
    {
        content: ItemPayload[];
        action: T;
    };

export interface BulkActionable<Tx extends unknown> {
    moveToSpace: (
        user: SessionUser,
        args: {
            projectUuid: string;
            itemUuid: string;
            targetSpaceUuid: string | null;
        },
        options?: {
            tx?: Tx;
            checkForAccess?: boolean;
            trackEvent?: boolean;
        },
    ) => Promise<void>;
}
