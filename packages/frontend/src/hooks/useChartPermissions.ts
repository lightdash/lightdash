import { subject } from '@casl/ability';
import { canMutateVerifiedContent, type SavedChart } from '@lightdash/common';
import { useMemo } from 'react';
import { useAbilityContext } from '../providers/Ability/useAbilityContext';
import useApp from '../providers/App/useApp';
import { useProjectUuid } from './useProjectUuid';

export type ChartPermissions = {
    /** Manage the chart, and its verification when it is verified. */
    canManageChart: boolean;
    /**
     * Manage without a direct dashboard grant. Boundary-crossing actions
     * (moving a chart out of its dashboard) must not be offered to grant-only
     * users, whose server-side check stays space-only.
     */
    canManageChartViaSpace: boolean;
    canViewContentAsCode: boolean;
    canManageExplore: boolean;
    canCreateDeliveriesAndAlerts: boolean;
    canManageContentVerification: boolean;
    canPromoteChart: boolean;
    canPinChart: boolean;
    /** The chart's verification leaves it editable; true without a chart. */
    canMutateVerification: boolean;
};

/**
 * The chart permission gates the chart page header, the chart actions menu and
 * the in-dashboard chart editor share, so all of them offer the same actions.
 */
export const useChartPermissions = (
    chart: SavedChart | undefined,
): ChartPermissions => {
    const ability = useAbilityContext();
    const { user } = useApp();
    const userUuid = user.data?.userUuid;
    const organizationUuid = user.data?.organizationUuid;
    const projectUuid = useProjectUuid();

    return useMemo(() => {
        const canMutateVerification =
            chart === undefined ||
            canMutateVerifiedContent(
                ability,
                {
                    organizationUuid: chart.organizationUuid,
                    projectUuid: chart.projectUuid,
                },
                chart.verification,
                userUuid,
            );

        return {
            canManageChart:
                chart !== undefined &&
                ability.can('manage', subject('SavedChart', { ...chart })) &&
                canMutateVerification,
            canManageChartViaSpace:
                chart !== undefined &&
                ability.can(
                    'manage',
                    subject('SavedChart', {
                        ...chart,
                        access: (chart.access ?? []).filter(
                            (row) => row.grantedVia === undefined,
                        ),
                    }),
                ),
            canViewContentAsCode:
                chart !== undefined &&
                ability.can(
                    'view',
                    subject('ContentAsCode', {
                        organizationUuid: chart.organizationUuid,
                        projectUuid: chart.projectUuid,
                    }),
                ),
            canManageExplore: ability.can(
                'manage',
                subject('Explore', {
                    organizationUuid,
                    projectUuid: chart?.projectUuid,
                }),
            ),
            canCreateDeliveriesAndAlerts: ability.can(
                'create',
                subject('ScheduledDeliveries', {
                    organizationUuid,
                    projectUuid,
                }),
            ),
            canManageContentVerification: ability.can(
                'manage',
                subject('ContentVerification', {
                    organizationUuid,
                    projectUuid,
                }),
            ),
            canPromoteChart:
                chart !== undefined &&
                !chart.dashboardUuid &&
                ability.can('promote', subject('SavedChart', { ...chart })),
            canPinChart: ability.can(
                'manage',
                subject('PinnedItems', { organizationUuid, projectUuid }),
            ),
            canMutateVerification,
        };
    }, [ability, chart, organizationUuid, projectUuid, userUuid]);
};
