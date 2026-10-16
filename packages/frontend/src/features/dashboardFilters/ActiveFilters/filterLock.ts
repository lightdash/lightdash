import { type DashboardFilterRule } from '@lightdash/common';
import i18n from '../../../i18n/i18n';
import { type EventData } from '../../../providers/Tracking/types';
import { EventName } from '../../../types/Events';

type FilterLockContext = {
    isLocked: boolean;
    hasTabs: boolean;
    activeTabUuid: string | undefined;
    dashboardUuid: string | undefined;
};

export const getFilterLockLabel = (isLocked: boolean, hasTabs: boolean) =>
    i18n.t(isLocked ? 'lock.unlockFilter' : 'lock.lockFilter', {
        ns: 'dashboardFilters',
        context: hasTabs ? 'tab' : undefined,
    });

// On tab-less dashboards we store the dashboard uuid as a sentinel
// in lockedTabUuids so the same shape can express "locked
// everywhere on this dashboard" without a schema change.
export const getFilterLockKey = ({
    hasTabs,
    activeTabUuid,
    dashboardUuid,
}: Pick<FilterLockContext, 'hasTabs' | 'activeTabUuid' | 'dashboardUuid'>) =>
    hasTabs ? activeTabUuid : dashboardUuid;

export const getFilterLockToggle = (
    filterRule: DashboardFilterRule,
    { isLocked, hasTabs, activeTabUuid, dashboardUuid }: FilterLockContext,
): {
    event: Extract<
        EventData,
        { name: EventName.DASHBOARD_FILTER_LOCK_TOGGLED }
    >;
    filterRule: DashboardFilterRule;
} | null => {
    const lockKey = getFilterLockKey({ hasTabs, activeTabUuid, dashboardUuid });
    if (!lockKey) return null;
    const existing = filterRule.lockedTabUuids ?? [];
    const nextTabUuids = isLocked
        ? existing.filter((uuid) => uuid !== lockKey)
        : [...existing, lockKey];
    return {
        event: {
            name: EventName.DASHBOARD_FILTER_LOCK_TOGGLED,
            properties: {
                action: isLocked ? 'unlock' : 'lock',
                dashboardUuid,
                tabUuid: hasTabs ? activeTabUuid : undefined,
                fieldId: filterRule.target.fieldId,
                tableName: filterRule.target.tableName,
            },
        },
        filterRule: {
            ...filterRule,
            lockedTabUuids: nextTabUuids.length > 0 ? nextTabUuids : undefined,
        },
    };
};
