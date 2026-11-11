import type { PartialDeep } from 'type-fest';
import type { DashboardAsCodeLanguageMap } from '../../utils/i18n/dashboardAsCode';
import type { ContentVerificationInfo } from '../contentVerification';
import type {
    Dashboard,
    DashboardChartTileProperties,
    DashboardConfig,
    DashboardControlRefKind,
    DashboardControlSection,
    DashboardDataAppTileProperties,
    DashboardHeadingTileProperties,
    DashboardLoomTileProperties,
    DashboardMarkdownTileProperties,
    DashboardParameterControl,
    DashboardSqlChartTileProperties,
    DashboardTab,
    DashboardTile,
    DashboardTileTypes,
    DateZoomControl,
    DateZoomTileTarget,
} from '../dashboard';
import type { DashboardFilterRule } from '../filter';
import type { PromotionChanges } from '../promotion';
import type { ContentAsCodeType } from './core';
import type { ContentAsCodeDirectAccess } from './directAccess';
import type { SpaceAsCode } from './spaces';

type DashboardTileAsCodeBase = {
    uuid: DashboardTile['uuid'] | undefined;
    tileSlug: string | undefined;
    type: DashboardTileTypes;
    /**
     * @minimum 0
     * @maximum 35
     */
    x: DashboardTile['x'];
    /**
     * @minimum 0
     */
    y: DashboardTile['y'];
    /**
     * @minimum 1
     */
    h: DashboardTile['h'];
    /**
     * @minimum 1
     * @maximum 36
     */
    w: DashboardTile['w'];
    /** Portable reference to the dashboard tab containing this tile. */
    tabSlug?: string | null;
    /** Legacy project-local tab reference. Accepted on upload for backwards compatibility. */
    tabUuid?: DashboardTile['tabUuid'];
};

/** What the tile's chart queries, so dashboard filters can be targeted per tile without opening each chart. */
export type DashboardTileChartQuery = {
    exploreName: string;
    fieldIds: string[];
};

export type DashboardChartTileAsCode = DashboardTileAsCodeBase & {
    type: DashboardTileTypes.SAVED_CHART;
    properties: Pick<
        DashboardChartTileProperties['properties'],
        'title' | 'hideTitle' | 'chartName'
    > & {
        chartSlug: string | null;
        /** Read-only and stripped on upload: absent on exports and uploads, set on AI content reads, null when the chart is not found in this project. */
        chartQuery?: DashboardTileChartQuery | null;
    };
};

export type DashboardSqlChartTileAsCode = DashboardTileAsCodeBase & {
    type: DashboardTileTypes.SQL_CHART;
    properties: Pick<
        DashboardSqlChartTileProperties['properties'],
        'title' | 'hideTitle' | 'chartName'
    > & { chartSlug: string | null };
};

export type DashboardMarkdownTileAsCode = DashboardTileAsCodeBase & {
    type: DashboardTileTypes.MARKDOWN;
    properties: DashboardMarkdownTileProperties['properties'];
};

export type DashboardLoomTileAsCode = DashboardTileAsCodeBase & {
    type: DashboardTileTypes.LOOM;
    properties: DashboardLoomTileProperties['properties'];
};

export type DashboardHeadingTileAsCode = DashboardTileAsCodeBase & {
    type: DashboardTileTypes.HEADING;
    properties: DashboardHeadingTileProperties['properties'];
};

export type DashboardDataAppTileAsCode = DashboardTileAsCodeBase & {
    type: DashboardTileTypes.DATA_APP;
    properties: Pick<
        DashboardDataAppTileProperties['properties'],
        'title' | 'hideTitle'
    > & {
        /** Portable project-scoped reference written by download. */
        appSlug?: string | null;
        /** Legacy project-local reference. Accepted on upload, never written by download. */
        appUuid?: string;
        /** Legacy read-only deletion marker. Ignored on upload, never written by download. */
        appDeletedAt?: string | null;
    };
};

export type DashboardTileAsCode =
    | DashboardChartTileAsCode
    | DashboardSqlChartTileAsCode
    | DashboardMarkdownTileAsCode
    | DashboardLoomTileAsCode
    | DashboardHeadingTileAsCode
    | DashboardDataAppTileAsCode;

export type DashboardTileWithSlug = DashboardTile & {
    tileSlug: string | undefined;
};

export type DashboardTabAsCode = {
    /** Portable tab identifier used by new downloads. */
    slug?: string;
    /** Legacy project-local identifier. Accepted on upload for backwards compatibility. */
    uuid?: DashboardTab['uuid'];
    /**
     * @minLength 1
     */
    name: string;
    /**
     * @minimum 0
     */
    order: number;
    hidden?: DashboardTab['hidden'];
};

export type DashboardControlSectionAsCode = {
    /** Portable section identifier; absent, derived from the name. */
    slug?: string;
    name: DashboardControlSection['name'];
    collapsed?: DashboardControlSection['collapsed'];
};

export type DashboardFilterRuleAsCode = DashboardFilterRule & {
    sectionSlug?: string;
    /** Resolves `controlOrder` refs in this file; derived on download, never stored */
    slug?: string;
};

export type DateZoomControlAsCode = {
    uuid: DateZoomControl['uuid'];
    /** Resolves `controlSlug` and `controlOrder` refs in this file; derived on download, never stored */
    slug?: string;
    name: DateZoomControl['name'];
    granularity: DateZoomControl['granularity'];
    hidden?: DateZoomControl['hidden'];
    sectionSlug?: string;
};

export type DateZoomTileTargetAsCode = {
    controlUuid: DateZoomTileTarget['controlUuid'];
    /** Slug of a date zoom control in this file */
    controlSlug?: string;
    fieldId: DateZoomTileTarget['fieldId'];
    tableName: DateZoomTileTarget['tableName'];
};

/** A date zoom control as uploaded: without a uuid, it keeps the saved control its slug matches */
export type DateZoomControlUploadAsCode = {
    uuid?: DateZoomControl['uuid'];
    /** Resolves `controlSlug` and `controlOrder` refs in this file; absent, derived from the name */
    slug?: string;
    name: DateZoomControl['name'];
    granularity: DateZoomControl['granularity'];
    hidden?: DateZoomControl['hidden'];
    sectionSlug?: string;
};

/** Points at its control by `controlSlug` or `controlUuid` */
export type DateZoomTileTargetUploadAsCode = {
    controlUuid?: DateZoomTileTarget['controlUuid'];
    controlSlug?: string;
    fieldId: DateZoomTileTarget['fieldId'];
    tableName: DateZoomTileTarget['tableName'];
};

export type DashboardParameterControlAsCode = {
    /** Portable control identifier; matching an existing slug preserves its id. */
    slug?: string;
    label: DashboardParameterControl['label'];
    value: DashboardParameterControl['value'];
    valueType: DashboardParameterControl['valueType'];
    sectionSlug?: string;
    parameters: DashboardParameterControl['parameters'];
    hidden?: boolean;
};

/** A control in `controlOrder`, by its slug in the same file */
export type DashboardControlRefAsCode = {
    kind: DashboardControlRefKind;
    /** Slug of a control of this kind in this file: a filter, parameter control, date zoom control or section */
    slug: string;
    /** Starts a new bar line; absent, it shares the line of the entry before it. On a section member it passes to the next loose entry in the list */
    newLine?: boolean;
};

export type DashboardConfigAsCode = {
    isDateZoomDisabled: DashboardConfig['isDateZoomDisabled'];
    isAddFilterDisabled?: DashboardConfig['isAddFilterDisabled'];
    pinnedParameters?: DashboardConfig['pinnedParameters'];
    parameterOrder?: DashboardConfig['parameterOrder'];
    dateZoomGranularities?: DashboardConfig['dateZoomGranularities'];
    defaultDateZoomGranularity?: DashboardConfig['defaultDateZoomGranularity'];
    dateZoomConfig?: {
        controls: DateZoomControlAsCode[];
        tileTargets: Record<string, DateZoomTileTargetAsCode>;
    };
    requiredFiltersNote?: DashboardConfig['requiredFiltersNote'];
    customMetrics?: DashboardConfig['customMetrics'];
    controlSections?: DashboardControlSectionAsCode[];
    parameterControls?: DashboardParameterControlAsCode[];
    /** The order of filters, parameter controls, date zoom controls and sections on the bar. Absent: the default order. */
    controlOrder?: DashboardControlRefAsCode[];
};

export type DashboardConfigUploadAsCode = Omit<
    DashboardConfigAsCode,
    'dateZoomConfig'
> & {
    dateZoomConfig?: {
        controls: DateZoomControlUploadAsCode[];
        tileTargets: Record<string, DateZoomTileTargetUploadAsCode>;
    };
};

export type DashboardAsCode = {
    description?: Dashboard['description'];
    parameters?: Dashboard['parameters'];
    config?: DashboardConfigAsCode;
    /**
     * @minLength 1
     */
    name: string;
    /**
     * @pattern ^[a-z0-9-]+$
     */
    slug: string;
    tabs: DashboardTabAsCode[];
    /** Not modifiable by user, but useful to know if it has been updated. Defaults to now if omitted. */
    updatedAt?: Date;
    tiles: DashboardTileAsCode[];
    version: number;
    contentType?: ContentAsCodeType.DASHBOARD;
    spaceSlug: string;
    downloadedAt?: Date;
    filters?: {
        dimensions?: Omit<DashboardFilterRuleAsCode, 'id'>[];
        metrics?: DashboardFilterRuleAsCode[];
        tableCalculations?: DashboardFilterRuleAsCode[];
    };
    /**
     * Declarative dashboard owner, referenced by email so it is portable across projects.
     * A string assigns the organization member with that email as owner, `null` unassigns
     * the owner, `undefined` leaves the current owner untouched. Download sets this to the
     * owner's email when an owner is assigned.
     */
    ownerEmail?: string | null;
    /**
     * Declarative verification state.
     * `true` verifies the dashboard on upload, `false` unverifies it, `undefined` leaves the
     * current state untouched. Download sets this to `true` when the dashboard is verified.
     */
    verified?: boolean;
    /** Detailed verification info (who/when). Read-only; ignored on upload. */
    verification?: ContentVerificationInfo | null;
    /** Direct user/group grants. Omission leaves the existing policy unchanged on upload. */
    access?: ContentAsCodeDirectAccess;
};

/** A dashboard file as uploaded */
export type DashboardUploadAsCode = Omit<DashboardAsCode, 'config'> & {
    config?: DashboardConfigUploadAsCode;
};

export type ApiDashboardAsCodeListResponse = {
    status: 'ok';
    results: {
        dashboards: DashboardAsCode[];
        languageMap:
            | Array<
                  | PartialDeep<
                        DashboardAsCodeLanguageMap,
                        { recurseIntoArrays: true }
                    >
                  | undefined
              >
            | undefined;
        missingIds: string[];
        spaces: SpaceAsCode[];
        total: number;
        offset: number;
    };
};
export type DashboardAsCodeUpsertResult = PromotionChanges & {
    /** Non-fatal issues, e.g. a data app tile whose app is not in this project. */
    warnings?: string[];
};

export type ApiDashboardAsCodeUpsertResponse = {
    status: 'ok';
    results: DashboardAsCodeUpsertResult;
};
