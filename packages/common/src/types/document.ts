import type { ApiExecuteAsyncMetricQueryResults } from './api';
import type { ApiSuccess } from './api/success';
import type { ChartAsCode } from './contentAsCode/charts';
import type { SavedMergeQuery } from './mergeQuery';
import type { SpaceAccess, SpaceMemberRole } from './space';

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

export type DocumentCellV3 =
    | { id: string; type: 'markdown'; content: { markdown: string } }
    | { id: string; type: 'chart'; content: DocumentChartContent };

export type DocumentContentV3 = { cells: DocumentCellV3[] };

export type DocumentSummary = {
    access?: SpaceAccess[];
    directAccessRoles?: SpaceMemberRole[];
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
    schemaVersion: 3;
    content: DocumentContentV3;
    createdByUserUuid: string | null;
    createdAt: Date;
};

export type Document = DocumentSummary & { version: DocumentVersion };

export type DocumentAsCode = Pick<
    DocumentSummary,
    'name' | 'slug' | 'description'
> & {
    spaceSlug: string;
    schemaVersion: 3;
    content: DocumentContentV3;
};

export type ApiDocumentResponse = ApiSuccess<Document>;
export type DocumentList = {
    items: DocumentSummary[];
    nextOffset: number | null;
};
export type ApiDocumentListResponse = ApiSuccess<DocumentList>;

export type CreateDocumentRequest = {
    name: string;
    slug?: string;
    description: string;
    spaceUuid: string;
    schemaVersion: 3;
    content: DocumentContentV3;
};

export type UpdateDocumentMetadataRequest = {
    name?: string;
    slug?: string;
    description?: string;
};

export type DocumentCellAppendOperation = {
    type: 'append';
    cell: DocumentCellV3;
};

export type DocumentCellInsertOperation = {
    type: 'insert_before' | 'insert_after';
    targetCellId: string;
    cell: DocumentCellV3;
};

export type DocumentCellReplaceOperation = {
    type: 'replace';
    cellId: string;
    cell: DocumentCellV3;
};

export type DocumentCellRemoveOperation = { type: 'remove'; cellId: string };

export type DocumentCellMoveOperation = {
    type: 'move_before' | 'move_after';
    cellId: string;
    targetCellId: string;
};

// Named members, so the API compatibility check diffs a change inside a
// cell property by property instead of reading it as a removed subschema.
export type DocumentCellOperation =
    | DocumentCellAppendOperation
    | DocumentCellInsertOperation
    | DocumentCellReplaceOperation
    | DocumentCellRemoveOperation
    | DocumentCellMoveOperation;

export type UpdateDocumentContentRequest = {
    baseVersionUuid: string;
    operations: DocumentCellOperation[];
};

export type ExecuteDocumentCellQueryRequest = { versionUuid: string };

export type DocumentQueryReference = {
    documentUuid: string;
    versionUuid: string;
    cellId: string;
};

export type ApiDocumentCellQueryResponse =
    ApiSuccess<ApiExecuteAsyncMetricQueryResults>;
