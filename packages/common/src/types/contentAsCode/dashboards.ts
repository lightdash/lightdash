import type { PartialDeep } from 'type-fest';
import type { DashboardAsCodeLanguageMap } from '../../utils/i18n/dashboardAsCode';
import type { ContentVerificationInfo } from '../contentVerification';
import type {
    Dashboard,
    DashboardChartTileProperties,
    DashboardDataAppTileProperties,
    DashboardHeadingTileProperties,
    DashboardLoomTileProperties,
    DashboardMarkdownTileProperties,
    DashboardSqlChartTileProperties,
    DashboardTab,
    DashboardTile,
    DashboardTileTypes,
} from '../dashboard';
import type { DashboardFilterRule } from '../filter';
import type { PromotionChanges } from '../promotion';
import type { ContentAsCodeType } from './core';
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
    tabUuid: DashboardTile['tabUuid'];
};

export type DashboardChartTileAsCode = DashboardTileAsCodeBase & {
    type: DashboardTileTypes.SAVED_CHART;
    properties: Pick<
        DashboardChartTileProperties['properties'],
        'title' | 'hideTitle' | 'chartName'
    > & { chartSlug: string | null };
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
    properties: DashboardDataAppTileProperties['properties'];
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
    uuid: DashboardTab['uuid'];
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

export type DashboardAsCode = Omit<
    Pick<
        Dashboard,
        'name' | 'description' | 'tabs' | 'slug' | 'config' | 'parameters'
    >,
    'name' | 'slug' | 'tabs'
> & {
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
        dimensions?: Omit<DashboardFilterRule, 'id'>[];
        metrics?: DashboardFilterRule[];
        tableCalculations?: DashboardFilterRule[];
    };
    /**
     * Declarative verification state.
     * `true` verifies the dashboard on upload, `false` unverifies it, `undefined` leaves the
     * current state untouched. Download sets this to `true` when the dashboard is verified.
     */
    verified?: boolean;
    /** Detailed verification info (who/when). Read-only; ignored on upload. */
    verification?: ContentVerificationInfo | null;
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
export type ApiDashboardAsCodeUpsertResponse = {
    status: 'ok';
    results: PromotionChanges;
};
