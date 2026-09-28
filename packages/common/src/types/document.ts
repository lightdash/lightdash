import type { ApiExecuteAsyncMetricQueryResults } from './api';
import type { ApiSuccess } from './api/success';
import type { ChartAsCode, ChartAsCodeConfig } from './contentAsCode/charts';
import type { SavedMergeQuery } from './mergeQuery';
import type { ChartType, DataAppVizOptionValues } from './savedCharts';
import type { SpaceAccess, SpaceMemberRole } from './space';

// Keep the published Document contract stable; custom chart types are rejected
// by parseDocumentContent and their new capabilities belong to saved charts.
type DocumentChartConfig = ChartAsCodeConfig<{
    type: ChartType.DATA_APP_VIZ;
    config?: {
        fieldMapping: Record<string, string>;
        optionValues?: DataAppVizOptionValues;
    } & { dataAppVizSlug?: string; dataAppVizUuid?: string };
}>;

export type SemanticChartAsCode = Pick<
    Omit<ChartAsCode, 'chartConfig'> & { chartConfig: DocumentChartConfig },
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

// Named so API diffs can match each variant instead of anonymous anyOf members.
export type DocumentSemanticChartContent = {
    source: 'semantic';
    chart: SemanticChartAsCode;
};

export type DocumentMergeChartContent = {
    source: 'merge';
    chart: MergeChartAsCode;
};

type DocumentChartContent =
    | DocumentSemanticChartContent
    | DocumentMergeChartContent;

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

export type Document = DocumentSummary & {
    version: DocumentVersion;
    pinnedListUuid: string | null;
};

export type DocumentAsCode = Pick<
    DocumentSummary,
    'name' | 'slug' | 'description'
> & {
    spaceSlug: string;
    schemaVersion: 1;
    content: DocumentContent;
};

export type ApiDocumentResponse = ApiSuccess<Document>;
export type ApiDocumentAsCodeResponse = ApiSuccess<DocumentAsCode>;
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

export type DuplicateDocumentRequest = Pick<
    CreateDocumentRequest,
    'name' | 'spaceUuid'
> &
    Partial<Pick<CreateDocumentRequest, 'description'>>;

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
