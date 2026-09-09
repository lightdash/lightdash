import { type ContentDraftStaleness } from './contentAsCode/draftRebase';
import { type ContentVerificationInfo } from './contentVerification';
import { type FilterableDimension, type Metric } from './field';
import { type DashboardFieldTarget, type DashboardFilters } from './filter';
import { type KnexPaginatedData } from './knex-paginate';
import { type AdditionalMetric } from './metricQuery';
import { type DashboardParameters } from './parameters';
import {
    type ChartKind,
    type ChartVersionSummary,
    type CreateSavedChart,
    type SavedChartType,
} from './savedCharts';
import type { SchedulerAndTargets } from './scheduler';
import { type SpaceAccess } from './space';
import { type DateGranularity } from './timeFrames';
import { type UpdatedByUser } from './user';
import { type ValidationSummary } from './validation';

export enum DashboardTileTypes {
    SAVED_CHART = 'saved_chart',
    SQL_CHART = 'sql_chart',
    MARKDOWN = 'markdown',
    LOOM = 'loom',
    HEADING = 'heading',
    DATA_APP = 'data_app',
}

type CreateDashboardTileBase = {
    uuid?: string;
    type: DashboardTileTypes;
    x: number;
    y: number;
    h: number;
    w: number;
    tabUuid: string | null | undefined;
};

type DashboardTileBase = Required<CreateDashboardTileBase>;

export type DashboardMarkdownTileProperties = {
    type: DashboardTileTypes.MARKDOWN;
    properties: {
        title: string;
        content: string;
        hideFrame?: boolean;
    };
};

export type DashboardLoomTileProperties = {
    type: DashboardTileTypes.LOOM;
    properties: {
        title: string;
        hideTitle?: boolean;
        url: string;
    };
};

export type DashboardChartTileProperties = {
    type: DashboardTileTypes.SAVED_CHART;
    properties: {
        title?: string;
        hideTitle?: boolean;
        savedChartUuid: string | null;
        belongsToDashboard?: boolean; // this should be required and not part of the "create" types, but we need to fix tech debt first. Open ticket https://github.com/lightdash/lightdash/issues/6450
        chartName?: string | null;
        lastVersionChartKind?: ChartKind | null;
        chartSlug?: string | null;
    };
};

export type DashboardSqlChartTileProperties = {
    type: DashboardTileTypes.SQL_CHART;
    properties: {
        title?: string;
        savedSqlUuid: string | null;
        chartName: string;
        hideTitle?: boolean;
        chartSlug?: string | null;
    };
};

export type DashboardHeadingTileProperties = {
    type: DashboardTileTypes.HEADING;
    properties: {
        title?: undefined;
        text: string;
        showDivider?: boolean;
    };
};

export type DashboardDataAppTileProperties = {
    type: DashboardTileTypes.DATA_APP;
    properties: {
        title: string;
        hideTitle?: boolean;
        appUuid: string;
        // Portable project-scoped identity, set by the backend on read.
        // Mirrors `chartSlug` on chart tiles.
        appSlug?: string | null;
        // Set by the backend when the referenced app has been soft-deleted,
        // so the frontend can render a placeholder instead of trying to load
        // a missing iframe.
        appDeletedAt?: string | null;
    };
};

export type CreateDashboardMarkdownTile = CreateDashboardTileBase &
    DashboardMarkdownTileProperties;
export type DashboardMarkdownTile = DashboardTileBase &
    DashboardMarkdownTileProperties;

export type CreateDashboardLoomTile = CreateDashboardTileBase &
    DashboardLoomTileProperties;
export type DashboardLoomTile = DashboardTileBase & DashboardLoomTileProperties;

export type CreateDashboardChartTile = CreateDashboardTileBase &
    DashboardChartTileProperties;
export type DashboardChartTile = DashboardTileBase &
    DashboardChartTileProperties;

export type CreateDashboardSqlChartTile = CreateDashboardTileBase &
    DashboardSqlChartTileProperties;
export type DashboardSqlChartTile = DashboardTileBase &
    DashboardSqlChartTileProperties;

export type CreateDashboardHeadingTile = CreateDashboardTileBase &
    DashboardHeadingTileProperties;
export type DashboardHeadingTile = DashboardTileBase &
    DashboardHeadingTileProperties;

export type CreateDashboardDataAppTile = CreateDashboardTileBase &
    DashboardDataAppTileProperties;
export type DashboardDataAppTile = DashboardTileBase &
    DashboardDataAppTileProperties;

export type CreateDashboard = {
    name: string;
    description?: string;
    tiles: Array<
        | CreateDashboardChartTile
        | CreateDashboardMarkdownTile
        | CreateDashboardLoomTile
        | CreateDashboardSqlChartTile
        | CreateDashboardHeadingTile
        | CreateDashboardDataAppTile
    >;
    filters?: DashboardFilters;
    parameters?: DashboardParameters;
    pinnedParameters?: string[];
    updatedByUser?: Pick<UpdatedByUser, 'userUuid'>;
    spaceUuid?: string;
    tabs: DashboardTab[];
    config?: DashboardConfig;
    colorPaletteUuid?: string | null;
    /** Set to a user uuid to assign an owner, null or omitted for no owner */
    ownerUserUuid?: string | null;
};

export type DashboardTile =
    | DashboardChartTile
    | DashboardMarkdownTile
    | DashboardLoomTile
    | DashboardSqlChartTile
    | DashboardHeadingTile
    | DashboardDataAppTile;

export const isDashboardChartTileType = (
    tile: DashboardTile,
): tile is DashboardChartTile => tile.type === DashboardTileTypes.SAVED_CHART;

export const isDashboardMarkdownTileType = (
    tile: DashboardTile,
): tile is DashboardMarkdownTile => tile.type === DashboardTileTypes.MARKDOWN;

export const isDashboardLoomTileType = (
    tile: DashboardTile,
): tile is DashboardLoomTile => tile.type === DashboardTileTypes.LOOM;

export const isDashboardSqlChartTile = (
    tile: DashboardTileBase,
): tile is DashboardSqlChartTile => tile.type === DashboardTileTypes.SQL_CHART;

export const isDashboardHeadingTileType = (
    tile: DashboardTile,
): tile is DashboardHeadingTile => tile.type === DashboardTileTypes.HEADING;

export const isDashboardDataAppTileType = (
    tile: DashboardTile,
): tile is DashboardDataAppTile => tile.type === DashboardTileTypes.DATA_APP;

export type DashboardTab = {
    uuid: string;
    /**
     * @minLength 1
     */
    name: string;
    /**
     * @minimum 0
     */
    order: number;
    hidden?: boolean;
};

export type DashboardTabWithUrls = DashboardTab & {
    nextUrl: string | null;
    prevUrl: string | null;
    selfUrl: string;
};

export type DashboardDAO = Omit<
    Dashboard,
    'inheritsFromOrgOrProject' | 'access'
>;

export type DateZoomTileTarget = {
    controlUuid: string;
    // Null for param-only tiles: they reference `${ld.parameters.date_zoom}` in
    // custom SQL but plot no re-grainable date dimension, so there is no field to
    // re-grain — only the control's grain feeds the reserved parameter.
    fieldId: string | null;
    tableName: string | null;
};

export type DateZoomControl = {
    uuid: string;
    name: string;
    granularity: DateGranularity | string;
    // Hidden from viewers; grain still applies to its tiles.
    hidden?: boolean;
};

export type DateZoomConfig = {
    controls: DateZoomControl[];
    tileTargets: Record<string, DateZoomTileTarget>;
};

export type DashboardConfig = {
    isDateZoomDisabled: boolean;
    isAddFilterDisabled?: boolean;
    pinnedParameters?: string[];
    parameterOrder?: string[];
    dateZoomGranularities?: (DateGranularity | string)[];
    defaultDateZoomGranularity?: DateGranularity | string;
    dateZoomConfig?: DateZoomConfig;
    /** Editor-authored note shown to viewers while filter rules are unmet */
    requiredFiltersNote?: string;
    /** Custom metrics offered to charts built inside this dashboard. Interim
     *  store — moves to a semantic-layer draft later; don't read it elsewhere. */
    customMetrics?: AdditionalMetric[];
};

export type DashboardOwner = {
    userUuid: string;
    firstName: string;
    lastName: string;
    email: string | null;
};

export type DashboardDraftOverlayError = {
    code: 'invalid_dashboard_draft';
    draftUuid: string;
};

export type Dashboard = {
    organizationUuid: string;
    projectUuid: string;
    /** Set when the viewer has an unpublished draft applied on top */
    hasUnpublishedChanges?: boolean;
    /** For reviewers: open drafts by other users awaiting review */
    draftsAwaitingReview?: number;
    /** The author draft was preserved but could not be safely rendered */
    draftOverlayError?: DashboardDraftOverlayError;
    /** The viewer authored a dismissed draft that can be reopened */
    dismissedDraftUuid?: string;
    /** The viewer's draft started from an upload snapshot the repo has since moved past */
    draftStaleness?: ContentDraftStaleness;
    dashboardVersionId: number;
    versionUuid: string;
    uuid: string;
    name: string;
    verification: ContentVerificationInfo | null;
    description?: string;
    updatedAt: Date;
    tiles: Array<DashboardTile>;
    filters: DashboardFilters;
    parameters?: DashboardParameters;
    updatedByUser?: UpdatedByUser;
    spaceUuid: string;
    spaceName: string;
    views: number;
    firstViewedAt: Date | string | null;
    pinnedListUuid: string | null;
    pinnedListOrder: number | null;
    tabs: DashboardTab[];
    inheritsFromOrgOrProject: boolean;
    access: SpaceAccess[] | null;
    slug: string;
    config?: DashboardConfig;
    colorPaletteUuid: string | null;
    owner: DashboardOwner | null;
    deletedAt?: Date;
    deletedBy?: {
        userUuid: string;
        firstName: string;
        lastName: string;
    } | null;
};

export type DashboardBasicDetails = Pick<
    Dashboard,
    | 'uuid'
    | 'slug'
    | 'name'
    | 'description'
    | 'updatedAt'
    | 'projectUuid'
    | 'updatedByUser'
    | 'organizationUuid'
    | 'spaceUuid'
    | 'views'
    | 'firstViewedAt'
    | 'pinnedListUuid'
    | 'pinnedListOrder'
> & {
    validationErrors?: ValidationSummary[];
    verification: ContentVerificationInfo | null;
    /** Only populated by the v2 content API */
    owner?: DashboardOwner | null;
};

export type DashboardBasicDetailsWithTileTypes = DashboardBasicDetails & {
    tileTypes: DashboardTileTypes[];
};

export type SpaceDashboard = DashboardBasicDetails;

export type DashboardUnversionedFields = Pick<
    CreateDashboard,
    'name' | 'description' | 'spaceUuid' | 'colorPaletteUuid' | 'ownerUserUuid'
>;

export type DashboardVersionedFields = Pick<
    CreateDashboard,
    'tiles' | 'filters' | 'parameters' | 'updatedByUser' | 'tabs' | 'config'
>;

export type UpdateDashboardDetails = Pick<Dashboard, 'name' | 'description'>;

type PreserveContentVerification = {
    preserveVerification?: boolean;
};

export type UpdateDashboard = (
    | DashboardUnversionedFields
    | DashboardVersionedFields
    | (DashboardUnversionedFields & DashboardVersionedFields)
) &
    PreserveContentVerification;

export type UpdateMultipleDashboards = Pick<
    Dashboard,
    'uuid' | 'name' | 'description' | 'spaceUuid'
>;

export type DashboardAvailableFilters = {
    savedQueryFilters: Record<string, number[]>;
    allFilterableFields: FilterableDimension[];
    allFilterableMetrics: Metric[];
    savedQueryMetricFilters: Record<string, number[]>;
    // Wire-compat with SDK bundles 1.64.0-1.197.x: those frontends call
    // Object.entries() on this key unguarded, so it must stay present (empty)
    // even though the auto-mapping feature it fed was removed in #27619.
    defaultTimeDimensions?: Record<string, DashboardFieldTarget>;
};

export type SavedChartsInfoForDashboardAvailableFilters = {
    tileUuid: string;
    savedChartUuid: string;
}[];

export const isDashboardUnversionedFields = (
    data: UpdateDashboard,
): data is DashboardUnversionedFields =>
    ('name' in data && !!data.name) ||
    ('spaceUuid' in data && !!data.spaceUuid) ||
    ('ownerUserUuid' in data && data.ownerUserUuid !== undefined);

export const isDashboardVersionedFields = (
    data: UpdateDashboard,
): data is DashboardVersionedFields => 'tiles' in data && !!data.tiles;

export const defaultTileSize = {
    h: 9,
    w: 15,
    x: 0,
    y: 0,
};

export const getDefaultChartTileSize = (
    chartType: SavedChartType | string | undefined,
) => {
    switch (chartType) {
        case 'big_number':
            return {
                h: 6,
                w: 9,
                x: 0,
                y: 0,
            };
        default:
            return defaultTileSize;
    }
};

export const hasChartsInDashboard = (dashboard: DashboardDAO) =>
    dashboard.tiles.some(
        (tile) =>
            isDashboardChartTileType(tile) &&
            tile.properties.belongsToDashboard,
    );

export type ApiGetDashboardsResponse = {
    status: 'ok';
    results: DashboardBasicDetailsWithTileTypes[];
};

export type ApiCreateDashboardResponse = {
    status: 'ok';
    results: Dashboard;
};

export type ApiUpdateDashboardsResponse = {
    status: 'ok';
    results: Dashboard[];
};

export type DuplicateDashboardParams = {
    dashboardName: string;
    dashboardDesc: string;
};

export function isDuplicateDashboardParams(
    params: DuplicateDashboardParams | CreateDashboard,
): params is DuplicateDashboardParams {
    return 'dashboardName' in params && 'dashboardDesc' in params;
}

export type CreateDashboardWithCharts = {
    name: string;
    description?: string;
    spaceUuid: string;
    charts: CreateSavedChart[];
};

export type ApiCreateDashboardWithChartsResponse = {
    status: 'ok';
    results: Dashboard;
};

export type ApiDashboardSchedulersResponse = {
    status: 'ok';
    results: SchedulerAndTargets[];
};

export type ApiDashboardResponse = {
    status: 'ok';
    results: Dashboard;
};

export type ApiDashboardPaginatedSchedulersResponse = {
    status: 'ok';
    results: KnexPaginatedData<SchedulerAndTargets[]>;
};

export type ApiCreateDashboardSchedulerResponse = {
    status: 'ok';
    results: SchedulerAndTargets;
};

export type DashboardVersionSummary = {
    dashboardUuid: string;
    versionUuid: string;
    createdAt: Date;
    createdBy: Pick<
        UpdatedByUser,
        'userUuid' | 'firstName' | 'lastName'
    > | null;
};

export type DashboardHistory = {
    history: DashboardVersionSummary[];
};

export type ChartVersionDifference = {
    tileUuid: string;
    chartUuid: string;
    chartName: string | null;
    currentVersion?: ChartVersionSummary | null;
    selectedVersion?: ChartVersionSummary | null;
};

export type DashboardVersion = DashboardVersionSummary & {
    dashboard: Dashboard;
    chartVersionDifferences?: ChartVersionDifference[];
};

export type ApiGetDashboardHistoryResponse = {
    status: 'ok';
    results: DashboardHistory;
};

export type DashboardCustomMetricAffectedChart = {
    uuid: string;
    name: string;
};

export type UpdateDashboardCustomMetric = {
    /** Replacement definition; must keep the existing table and name */
    metric: AdditionalMetric;
    /** Report affected charts without writing anything */
    dryRun?: boolean;
};

export type DashboardCustomMetricUpdateResult = {
    customMetrics: AdditionalMetric[];
    /** Dashboard-owned charts whose snapshot references the metric */
    affectedCharts: DashboardCustomMetricAffectedChart[];
    dryRun: boolean;
};

export type ApiUpdateDashboardCustomMetricResponse = {
    status: 'ok';
    results: DashboardCustomMetricUpdateResult;
};

export type ApiGetDashboardVersionResponse = {
    status: 'ok';
    results: DashboardVersion;
};

export type ApiDashboardRollbackResponse = {
    status: 'ok';
    results: undefined;
};

/** Dashboards owned by a user across all projects, e.g. for offboarding */
export type UserDashboardsSummary = {
    totalCount: number;
    byProject: Array<{
        projectUuid: string;
        projectName: string;
        count: number;
    }>;
};

export type ReassignUserDashboardsRequest = {
    newOwnerUserUuid: string;
};

export type ApiUserDashboardsSummaryResponse = {
    status: 'ok';
    results: UserDashboardsSummary;
};

export type ApiReassignUserDashboardsResponse = {
    status: 'ok';
    results: { reassignedCount: number };
};
