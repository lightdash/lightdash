import type { SnowflakeAiBoundaryGuideConfig } from '@lightdash/common';

export const needsRestrictionsConfirmation = (
    config: SnowflakeAiBoundaryGuideConfig,
): boolean =>
    config.statuses.checks !== 'verified' || getRefusedMemberCount(config) > 0;

export const getRefusedMemberCount = (
    config: SnowflakeAiBoundaryGuideConfig,
): number =>
    Math.max(
        0,
        config.memberCount -
            (config.aiIdentitiesEnabled
                ? config.readyIdentityCount
                : config.signedInMemberCount),
    );

export const getBoundarySecuritySummary = (
    config: SnowflakeAiBoundaryGuideConfig,
): string =>
    [
        `AI access restrictions: ${config.restrictionsEnabled ? 'on' : 'off'}`,
        `${config.aiIdentitiesEnabled ? config.readyIdentityCount : config.signedInMemberCount} of ${config.memberCount} people ready`,
        ...Object.entries(config.statuses).map(
            ([section, status]) => `${section}: ${status}`,
        ),
        ...Object.entries(config.state.marks).map(
            ([section, mark]) =>
                `${section}: marked as done by ${mark.name} on ${mark.at}`,
        ),
        config.state.lastTest
            ? `Last check: ${config.state.lastTest.at} by ${config.state.lastTest.name}`
            : 'Checks have not run.',
        ...(config.state.lastTest?.checks.map(
            (check) => `${check.id}: ${check.status}. ${check.detail}`,
        ) ?? []),
        "Does not cover: views with owner's rights, earlier results on legacy OAuth without restrictions, and users with their own session policy. Masking checks cover only the selected column.",
    ].join('\n');
