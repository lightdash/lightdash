import {
    assertUnreachable,
    type DecodedEmbed,
    type UpdateEmbed,
} from '@lightdash/common';

export type EmbedCodeTarget = {
    type: 'chart' | 'dashboard';
    uuid: string;
    name: string;
    spaceUuid: string | null;
};

export type EmbedCodeAvailability =
    | 'loading'
    | 'featureUnavailable'
    | 'notConfigured'
    | 'loadError'
    | 'targetNotAllowed'
    | 'ready';

export const isTargetAllowed = (
    config: DecodedEmbed,
    target: EmbedCodeTarget,
): boolean => {
    switch (target.type) {
        case 'chart':
            return (
                config.allowAllCharts === true ||
                config.chartUuids?.includes(target.uuid) === true
            );
        case 'dashboard':
            return (
                config.allowAllDashboards === true ||
                config.dashboardUuids.includes(target.uuid)
            );
        default:
            return assertUnreachable(
                target.type,
                `Unknown embed target: ${target.type}`,
            );
    }
};

export const getEmbedCodeAvailability = ({
    isLoading,
    hasError,
    errorStatusCode,
    config,
    target,
}: {
    isLoading: boolean;
    hasError: boolean;
    errorStatusCode: number | undefined;
    config: DecodedEmbed | undefined;
    target: EmbedCodeTarget;
}): EmbedCodeAvailability => {
    if (isLoading) return 'loading';
    if (errorStatusCode === 403) return 'featureUnavailable';
    if (errorStatusCode === 404) return 'notConfigured';
    if (hasError) return 'loadError';
    if (!config) return 'notConfigured';
    if (!isTargetAllowed(config, target)) return 'targetNotAllowed';
    return 'ready';
};

// PATCH replaces the allow list, so send the current configuration plus the target.
export const getConfigAllowingTarget = (
    config: DecodedEmbed,
    target: EmbedCodeTarget,
): UpdateEmbed => {
    const current: UpdateEmbed = {
        dashboardUuids: config.dashboardUuids,
        allowAllDashboards: config.allowAllDashboards,
        chartUuids: config.chartUuids,
        allowAllCharts: config.allowAllCharts,
        appUuids: config.appUuids,
        allowAllApps: config.allowAllApps,
    };

    switch (target.type) {
        case 'chart':
            return {
                ...current,
                chartUuids: [
                    ...new Set([...(config.chartUuids ?? []), target.uuid]),
                ],
            };
        case 'dashboard':
            return {
                ...current,
                dashboardUuids: [
                    ...new Set([...config.dashboardUuids, target.uuid]),
                ],
            };
        default:
            return assertUnreachable(
                target.type,
                `Unknown embed target: ${target.type}`,
            );
    }
};
