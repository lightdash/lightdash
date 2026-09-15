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

export type DocumentCellV1 =
    | { id: string; type: 'markdown'; content: string }
    | {
          id: string;
          type: 'chart';
          content:
              | { source: 'semantic'; chart: SemanticChartAsCode }
              | { source: 'merge'; chart: MergeChartAsCode };
      };

export type DocumentContentV1 = { cells: DocumentCellV1[] };

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
    schemaVersion: 1;
    content: DocumentContentV1;
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
