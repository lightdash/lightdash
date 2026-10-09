import type {
    ApiExecuteAsyncMetricQueryResults,
    ApiExecuteAsyncSqlQueryResults,
} from './api';
import type { ApiSuccess } from './api/success';
import type { ContentAsCodeUpsertAction } from './contentAsCode/base';
import type { ChartAsCode, SqlChartAsCode } from './contentAsCode/charts';
import type { ContentVerificationInfo } from './contentVerification';
import type { DashboardOwner } from './dashboard';
import type { SavedMergeQuery } from './mergeQuery';
import type { SpaceAccess, SpaceMemberRole } from './space';
import type { LightdashUser } from './user';

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

// Named so the OpenAPI spec references each member by name: API diff tools
// cannot pair anonymous union members, and report any change inside one as a
// removed request subschema.
export type DocumentSemanticChartContent = {
    source: 'semantic';
    chart: SemanticChartAsCode;
};

export type DocumentMergeChartContent = {
    source: 'merge';
    chart: MergeChartAsCode;
};

/** A SQL Runner chart owned by the Document, in its content-as-code shape. */
export type DocumentSqlChart = Pick<
    SqlChartAsCode,
    'name' | 'sql' | 'limit' | 'config' | 'chartKind'
> & {
    description?: string;
    /** The warehouse connection's name; omitted for the project's default connection. */
    connection?: string;
    /** The stored identity of `connection`, set by the server; dropped as code. */
    warehouseConnectionUuid?: string;
};

export type DocumentSqlChartContent = {
    source: 'sql';
    chart: DocumentSqlChart;
};

export type DocumentChartContent =
    | DocumentSemanticChartContent
    | DocumentMergeChartContent
    | DocumentSqlChartContent;

/** Charts that run a metric query against an Explore. */
export type DocumentExploreChartContent = Exclude<
    DocumentChartContent,
    DocumentSqlChartContent
>;

export const isDocumentExploreChart = (
    content: DocumentChartContent,
): content is DocumentExploreChartContent => content.source !== 'sql';

/** Charts by id. Stored ids are sequential per Document (`c1`, `c2`, …). */
export type DocumentCharts = Record<string, DocumentChartContent>;

/**
 * Markdown with a `<document-chart id="…">` block wherever a chart sits, and
 * the charts those blocks reference. On writes, ids that are not `c<n>` are
 * temporary keys the server replaces with the next free id.
 */
export type DocumentContent = {
    markdown: string;
    charts: DocumentCharts;
    /**
     * Charts saved by a newer release, kept verbatim so saving the Document
     * here doesn't lose them. Omitted when there are none.
     */
    unsupportedCharts?: Record<string, unknown>;
};

/** Assignable owner, independent of the immutable creator and version authors. */
export type DocumentOwner = DashboardOwner;

export type DocumentSummary = {
    access?: SpaceAccess[];
    directAccessRoles?: SpaceMemberRole[];
    documentUuid: string;
    projectUuid: string;
    organizationUuid: string;
    /** Null for a personal Document, visible only to its creator and admins. */
    spaceUuid: string | null;
    name: string;
    slug: string;
    description: string;
    createdByUserUuid: string | null;
    ownerUserUuid: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export type DocumentVersion = {
    versionUuid: string;
    versionNumber: number;
    schemaVersion: 2;
    content: DocumentContent;
    createdByUserUuid: string | null;
    createdAt: Date;
};

export type Document = DocumentSummary & {
    createdBy: Pick<
        LightdashUser,
        'userUuid' | 'firstName' | 'lastName' | 'avatarUrl' | 'avatarGradient'
    > | null;
    owner: DocumentOwner | null;
    version: DocumentVersion;
    pinnedListUuid: string | null;
    verification: ContentVerificationInfo | null;
};

export type DocumentAsCode = Pick<
    DocumentSummary,
    'name' | 'slug' | 'description'
> & {
    spaceSlug: string;
    schemaVersion: 2;
} & DocumentContent;

export type ApiDocumentResponse = ApiSuccess<Document>;
export type ApiDocumentAsCodeResponse = ApiSuccess<DocumentAsCode>;
export type DocumentAsCodeList = {
    documents: DocumentAsCode[];
    missingSlugs: string[];
    nextOffset: number | null;
};
export type ApiDocumentAsCodeListResponse = ApiSuccess<DocumentAsCodeList>;
export type ApiDocumentAsCodeUpsertResponse = ApiSuccess<{
    action: ContentAsCodeUpsertAction;
}>;
export type DocumentList = {
    items: DocumentSummary[];
    nextOffset: number | null;
};
export type ApiDocumentListResponse = ApiSuccess<DocumentList>;

/** One entry in a Document's immutable version history, newest first. */
export type DocumentVersionSummary = Pick<
    DocumentVersion,
    'versionUuid' | 'versionNumber' | 'createdAt'
> & {
    /** Who saved this version; null when the user was deleted or unknown. */
    createdBy: Pick<
        LightdashUser,
        'userUuid' | 'firstName' | 'lastName' | 'avatarUrl' | 'avatarGradient'
    > | null;
};
export type DocumentVersionList = {
    items: DocumentVersionSummary[];
    nextOffset: number | null;
};
export type ApiDocumentVersionListResponse = ApiSuccess<DocumentVersionList>;

export type CreateDocumentRequest = {
    name: string;
    slug?: string;
    description: string;
    /** Omit to create a personal Document, visible only to its creator and admins. */
    spaceUuid?: string;
    schemaVersion: 2;
    content: DocumentContent;
    /** Organization member to assign as owner; omitted or null leaves the Document unowned. */
    ownerUserUuid?: string | null;
};

export type UpdateDocumentMetadataRequest = {
    name?: string;
    slug?: string;
    description?: string;
    /** Organization member to assign as owner; null unassigns, omitted leaves it unchanged. */
    ownerUserUuid?: string | null;
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

export type ExecuteDocumentChartQueryRequest = { versionUuid: string };

export type DocumentQueryReference = {
    documentUuid: string;
    versionUuid: string;
    chartId: string;
};

/** A Document whose current version links a saved chart. */
export type DocumentLinkingChart = Pick<
    DocumentSummary,
    'documentUuid' | 'name' | 'slug' | 'spaceUuid'
>;
export type ApiDocumentsLinkingChartResponse = ApiSuccess<
    DocumentLinkingChart[]
>;

/** SQL charts answer with SQL results; the others with metric query results. */
export type ApiDocumentChartQueryResponse = ApiSuccess<
    ApiExecuteAsyncMetricQueryResults | ApiExecuteAsyncSqlQueryResults
>;
