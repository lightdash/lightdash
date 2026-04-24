import { type DashboardTileTypes } from '../../types/dashboard';
import { type PreAggregateMatchMiss } from '../../types/preAggregate';

export enum TileIneligibleReason {
    NON_CHART_TILE = 'non_chart_tile',
    SQL_CHART = 'sql_chart',
    ORPHANED_CHART = 'orphaned_chart',
    EXPLORE_RESOLUTION_ERROR = 'explore_resolution_error',
}

export type TilePreAggregateAuditHit = {
    status: 'hit';
    tileUuid: string;
    tileName: string;
    tileType: DashboardTileTypes.SAVED_CHART;
    savedChartUuid: string;
    exploreName: string;
    preAggregateName: string;
};

export type TilePreAggregateAuditMiss = {
    status: 'miss';
    tileUuid: string;
    tileName: string;
    tileType: DashboardTileTypes.SAVED_CHART;
    savedChartUuid: string;
    exploreName: string;
    miss: PreAggregateMatchMiss;
    missFieldLabel: string | null;
};

export type TilePreAggregateAuditIneligible = {
    status: 'ineligible';
    tileUuid: string;
    tileName: string;
    tileType: DashboardTileTypes;
    ineligibleReason: TileIneligibleReason;
};

export type TilePreAggregateAuditStatus =
    | TilePreAggregateAuditHit
    | TilePreAggregateAuditMiss
    | TilePreAggregateAuditIneligible;

export type TabAuditGroup = {
    tabUuid: string | null;
    tabName: string | null;
    tiles: TilePreAggregateAuditStatus[];
};

export type DashboardPreAggregateAuditSummary = {
    hitCount: number;
    missCount: number;
    ineligibleCount: number;
};

export type DashboardPreAggregateAudit = {
    dashboardUuid: string;
    dashboardSlug: string;
    dashboardName: string;
    tabs: TabAuditGroup[];
    summary: DashboardPreAggregateAuditSummary;
};
