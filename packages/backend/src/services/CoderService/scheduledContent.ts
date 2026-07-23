import {
    assertUnreachable,
    isEmailTarget,
    isGoogleChatTarget,
    isMsTeamsTarget,
    isSchedulerCsvOptions,
    isSchedulerImageOptions,
    isSlackTarget,
    NotFoundError,
    SchedulerFormat,
    type DashboardDAO,
    type DashboardFilterRule,
    type DashboardTileTarget,
    type ScheduledDeliveryFormatAsCode,
    type ScheduledDeliveryTargetAsCode,
    type SchedulerAndTargets,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import { getChartSlugForTileUuid } from './dashboardReferences';

export const getScheduledDeliveryTargetsAsCode = (
    scheduler: SchedulerAndTargets,
): ScheduledDeliveryTargetAsCode[] | null => {
    const targets: ScheduledDeliveryTargetAsCode[] = [];
    for (const target of scheduler.targets) {
        if (isEmailTarget(target)) {
            targets.push({ type: 'email', recipient: target.recipient });
        } else if (isSlackTarget(target)) {
            targets.push({ type: 'slack', channel: target.channel });
        } else if (isMsTeamsTarget(target) || isGoogleChatTarget(target)) {
            return null;
        } else {
            assertUnreachable(target, 'Unknown scheduled delivery target');
        }
    }
    return targets;
};

export const getScheduledDeliveryTargetKey = (
    target: ScheduledDeliveryTargetAsCode,
): string => {
    switch (target.type) {
        case 'email':
            return `${target.type}:${target.recipient}`;
        case 'slack':
            return `${target.type}:${target.channel}`;
        default:
            return assertUnreachable(
                target,
                'Unknown scheduled delivery target',
            );
    }
};

export const getDashboardScheduledDeliveryFiltersWithTileSlugs = (
    dashboard: DashboardDAO,
    filters: DashboardFilterRule[] | undefined,
): Omit<DashboardFilterRule, 'id'>[] | null => {
    if (!filters) return null;
    return filters.map((filter) => ({
        ...filter,
        id: undefined,
        tileTargets: Object.entries(filter.tileTargets ?? {}).reduce<
            Record<string, DashboardTileTarget>
        >((result, [tileUuid, target]) => {
            const tileSlug = getChartSlugForTileUuid(dashboard, tileUuid);
            return tileSlug ? { ...result, [tileSlug]: target } : result;
        }, {}),
    }));
};

export const getDashboardScheduledDeliveryFiltersWithTileUuids = (
    dashboard: DashboardDAO,
    filters: Omit<DashboardFilterRule, 'id'>[] | null,
): DashboardFilterRule[] | undefined => {
    if (!filters) return undefined;
    return filters.map((filter) => ({
        ...filter,
        id: uuidv4(),
        tileTargets: Object.entries(filter.tileTargets ?? {}).reduce<
            Record<string, DashboardTileTarget>
        >((result, [tileSlug, target]) => {
            const tileUuid = dashboard.tiles.find(
                (tile) =>
                    getChartSlugForTileUuid(dashboard, tile.uuid) === tileSlug,
            )?.uuid;
            if (!tileUuid) {
                throw new NotFoundError(
                    `Dashboard tile '${
                        tileSlug
                    }' referenced by scheduled delivery was not found`,
                );
            }
            return { ...result, [tileUuid]: target };
        }, {}),
    }));
};

const getDashboardTabBaseSlug = (tab: DashboardDAO['tabs'][number]): string => {
    const slug = tab.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || `tab-${tab.order + 1}`;
};

export const getDashboardTabSlug = (
    dashboard: Pick<DashboardDAO, 'tabs'>,
    tabUuid: string,
): string => {
    const tab = dashboard.tabs.find(({ uuid }) => uuid === tabUuid);
    if (!tab) {
        throw new NotFoundError(
            `Dashboard tab '${
                tabUuid
            }' referenced by scheduled delivery was not found`,
        );
    }
    const baseSlug = getDashboardTabBaseSlug(tab);
    const matchingTabs = dashboard.tabs
        .filter((candidate) => getDashboardTabBaseSlug(candidate) === baseSlug)
        .sort((left, right) => left.order - right.order);
    if (matchingTabs.length === 1) return baseSlug;
    const index = matchingTabs.findIndex(({ uuid }) => uuid === tabUuid);
    return `${baseSlug}-${index + 1}`;
};

export const getDashboardTabUuid = (
    dashboard: Pick<DashboardDAO, 'tabs'>,
    tabSlug: string,
): string => {
    const tab =
        dashboard.tabs.find(
            ({ uuid }) => getDashboardTabSlug(dashboard, uuid) === tabSlug,
        ) ?? dashboard.tabs.find(({ uuid }) => uuid === tabSlug);
    if (!tab) {
        throw new NotFoundError(
            `Dashboard tab '${
                tabSlug
            }' referenced by scheduled delivery was not found`,
        );
    }
    return tab.uuid;
};

export const getScheduledDeliveryFormat = (
    scheduler: SchedulerAndTargets,
): ScheduledDeliveryFormatAsCode | null => {
    switch (scheduler.format) {
        case SchedulerFormat.CSV:
        case SchedulerFormat.XLSX:
            return isSchedulerCsvOptions(scheduler.options)
                ? { format: scheduler.format, options: scheduler.options }
                : null;
        case SchedulerFormat.IMAGE:
            return isSchedulerImageOptions(scheduler.options)
                ? { format: scheduler.format, options: scheduler.options }
                : null;
        case SchedulerFormat.PDF:
            return { format: scheduler.format, options: {} };
        case SchedulerFormat.GSHEETS:
            return null;
        default:
            return assertUnreachable(
                scheduler.format,
                'Unknown scheduled delivery format',
            );
    }
};
