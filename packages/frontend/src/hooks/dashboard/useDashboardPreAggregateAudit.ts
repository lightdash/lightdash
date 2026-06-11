import {
    PreAggregateMissReason,
    type ApiError,
    type ApiRunDashboardPreAggregateAuditBody,
    type DashboardFilters,
    type DashboardPreAggregateAudit,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import { type TilePreAggregateStatus } from '../../providers/Dashboard/types';

const runDashboardPreAggregateAudit = ({
    projectUuid,
    dashboardUuid,
    dashboardFilters,
}: {
    projectUuid: string;
    dashboardUuid: string;
    dashboardFilters: DashboardFilters;
}): Promise<DashboardPreAggregateAudit> => {
    const body: ApiRunDashboardPreAggregateAuditBody = { dashboardFilters };
    return lightdashApi<DashboardPreAggregateAudit>({
        url: `/projects/${projectUuid}/pre-aggregates/dashboards/${dashboardUuid}/audit`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify(body),
    });
};

export const auditResponseToTileStatuses = (
    audit: DashboardPreAggregateAudit,
    tileNamesById: Record<string, string>,
): Record<string, TilePreAggregateStatus> => {
    const result: Record<string, TilePreAggregateStatus> = {};
    audit.tabs.forEach((tab) => {
        tab.tiles.forEach((tile) => {
            if (tile.status === 'ineligible') return;
            const isNoPreAggregatesDefined =
                tile.status === 'miss' &&
                tile.miss.reason ===
                    PreAggregateMissReason.NO_PRE_AGGREGATES_DEFINED;
            result[tile.tileUuid] = {
                tileUuid: tile.tileUuid,
                tileName: tileNamesById[tile.tileUuid] ?? tile.tileUuid,
                hit: tile.status === 'hit',
                preAggregateName:
                    tile.status === 'hit' ? tile.preAggregateName : null,
                reason: tile.status === 'miss' ? tile.miss : null,
                reasonFieldLabel:
                    tile.status === 'miss' ? tile.missFieldLabel : null,
                hasPreAggregateMetadata: !isNoPreAggregatesDefined,
                tabUuid: tab.tabUuid,
            };
        });
    });
    return result;
};

export const useDashboardPreAggregateAudit = ({
    projectUuid,
    dashboardUuid,
    dashboardFilters,
    enabled = true,
}: {
    projectUuid: string | undefined;
    dashboardUuid: string | undefined;
    dashboardFilters: DashboardFilters;
    enabled?: boolean;
}) =>
    useQuery<DashboardPreAggregateAudit, ApiError>({
        queryKey: [
            'dashboard-pre-aggregate-audit',
            projectUuid,
            dashboardUuid,
            dashboardFilters,
        ],
        queryFn: () =>
            runDashboardPreAggregateAudit({
                projectUuid: projectUuid!,
                dashboardUuid: dashboardUuid!,
                dashboardFilters,
            }),
        enabled: enabled && !!projectUuid && !!dashboardUuid,
    });
