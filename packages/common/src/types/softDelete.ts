import type { ChartSourceType, ContentType } from './content';
import type { KnexPaginatedData } from './knex-paginate';
import type { ChartKind } from './savedCharts';

// ---------------------------------------------------------------------------
// Utility: WithDescendantCounts
// ---------------------------------------------------------------------------
type DescendantCountKey = 'nestedSpace' | 'dashboard' | 'chart' | 'scheduler';

export type WithDescendantCounts<T, K extends DescendantCountKey = never> = [
    K,
] extends [never]
    ? T
    : T & { [P in K as `${P}Count`]: number };

// ---------------------------------------------------------------------------
// Base deleted-content shapes (no descendant counts)
// ---------------------------------------------------------------------------

type DeletedChartBase = {
    uuid: string;
    name: string;
    description: string | null;
    contentType: ContentType.CHART;
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

export type DeletedDbtChartContentSummary = DeletedChartBase & {
    source: ChartSourceType.DBT_EXPLORE;
};

export type DeletedSqlChartContentSummary = DeletedChartBase & {
    source: ChartSourceType.SQL;
};

export type DeletedChartContentSummary =
    | DeletedDbtChartContentSummary
    | DeletedSqlChartContentSummary;

export type DeletedDashboardContentSummary = {
    uuid: string;
    name: string;
    description: string | null;
    contentType: ContentType.DASHBOARD;
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

export type DeletedSpaceContentSummary = {
    uuid: string;
    name: string;
    description: string | null;
    contentType: ContentType.SPACE;
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

export type DeletedContentSummary =
    | DeletedChartContentSummary
    | DeletedDashboardContentSummary
    | DeletedSpaceContentSummary;

// ---------------------------------------------------------------------------
// Content-with-descendant-counts (returned by ContentModel / API)
// ---------------------------------------------------------------------------
export type DeletedContentWithDescendants =
    | WithDescendantCounts<DeletedDbtChartContentSummary, 'scheduler'>
    | WithDescendantCounts<DeletedSqlChartContentSummary, never>
    | WithDescendantCounts<
          DeletedDashboardContentSummary,
          'chart' | 'scheduler'
      >
    | WithDescendantCounts<
          DeletedSpaceContentSummary,
          'nestedSpace' | 'dashboard' | 'chart' | 'scheduler'
      >;

export type DeletedContentFilters = {
    projectUuids: string[];
    search?: string;
    contentTypes?: ContentType[];
    deletedByUserUuids?: string[];
};

// API types
export type ApiDeletedContentResponse = {
    status: 'ok';
    results: KnexPaginatedData<DeletedContentWithDescendants[]>;
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
