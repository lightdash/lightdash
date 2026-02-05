import type { ChartSourceType, ContentType } from './content';
import type { KnexPaginatedData } from './knex-paginate';
import type { ChartKind } from './savedCharts';

export type DeletedChartContentSummary = {
    uuid: string;
    name: string;
    description: string | null;
    contentType: ContentType.CHART;
    source: ChartSourceType;
    chartKind: ChartKind | null;
    deletedAt: Date;
    deletedBy: {
        userUuid: string;
        firstName: string;
        lastName: string;
    } | null;
    spaceUuid: string;
    spaceName: string;
    projectUuid: string;
    organizationUuid: string;
};

// Union type for future extensibility (dashboards, spaces, etc.)
export type DeletedContentSummary = DeletedChartContentSummary;

export type DeletedContentFilters = {
    projectUuids: string[];
    search?: string;
    contentTypes?: ContentType[];
    deletedByUserUuids?: string[];
};

// API types
export type ApiDeletedContentResponse = {
    status: 'ok';
    results: KnexPaginatedData<DeletedContentSummary[]>;
};

export type DeletedContentItem =
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

export type ApiRestoreContentBody = {
    item: DeletedContentItem;
};

export type ApiPermanentlyDeleteContentBody = {
    item: DeletedContentItem;
};
