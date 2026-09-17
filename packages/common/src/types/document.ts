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

export type DocumentCell =
    | { type: 'markdown'; content: { markdown: string } }
    | { type: 'chart'; content: DocumentChartContent };

export type DocumentContent = { cells: DocumentCell[] };

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
    schemaVersion: 1;
    content: DocumentContent;
    createdByUserUuid: string | null;
    createdAt: Date;
};

export type Document = DocumentSummary & { version: DocumentVersion };

export type DocumentAsCode = Pick<
    DocumentSummary,
    'name' | 'slug' | 'description'
> & {
    spaceSlug: string;
    schemaVersion: 1;
    content: DocumentContent;
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
    schemaVersion: 1;
    content: DocumentContent;
};

export type UpdateDocumentMetadataRequest = {
    name?: string;
    slug?: string;
    description?: string;
};

export type UpdateDocumentContentRequest = {
    baseVersionUuid: string;
    content: DocumentContent;
};

export type ExecuteDocumentCellQueryRequest = { versionUuid: string };

export type DocumentQueryReference = {
    documentUuid: string;
    versionUuid: string;
    cellIndex: number;
};

export type ApiDocumentCellQueryResponse =
    ApiSuccess<ApiExecuteAsyncMetricQueryResults>;
