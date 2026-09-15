import type { ApiSuccess } from './api/success';
import type { ChartAsCode } from './contentAsCode/charts';
import type { SavedMergeQuery } from './mergeQuery';

export type SemanticChartAsCode = Pick<
    ChartAsCode,
    | 'name'
    | 'description'
    | 'tableName'
    | 'metricQuery'
    | 'chartConfig'
    | 'tableConfig'
    | 'pivotConfig'
    | 'parameters'
>;

export type MergeChartAsCode = SemanticChartAsCode & {
    merge: SavedMergeQuery;
};

type DocumentChartContent =
    | { source: 'semantic'; chart: SemanticChartAsCode }
    | { source: 'merge'; chart: MergeChartAsCode };

export type DocumentCellV1 =
    | { id: string; type: 'markdown'; content: string }
    | {
          id: string;
          type: 'chart';
          content: DocumentChartContent;
      };

export type DocumentContentV1 = { cells: DocumentCellV1[] };

export type DocumentCellV2 =
    | {
          id: string;
          type: 'markdown';
          content: { title?: string; markdown: string };
      }
    | {
          id: string;
          type: 'chart';
          content: DocumentChartContent & {
              title?: string;
          };
      };

export type DocumentContentV2 = { cells: DocumentCellV2[] };

export type DocumentSummary = {
    documentUuid: string;
    projectUuid: string;
    organizationUuid: string;
    spaceUuid: string;
    name: string;
    slug: string;
    description: string;
    createdByUserUuid: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export type DocumentVersion = {
    versionUuid: string;
    versionNumber: number;
    schemaVersion: 2;
    content: DocumentContentV2;
    createdByUserUuid: string | null;
    createdAt: Date;
};

export type Document = DocumentSummary & { version: DocumentVersion };

export type ApiDocumentResponse = ApiSuccess<Document>;
export type DocumentList = {
    items: DocumentSummary[];
    nextOffset: number | null;
};
export type ApiDocumentListResponse = ApiSuccess<DocumentList>;
