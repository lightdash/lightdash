import {
    AI_IDENTITY_NAME_PLACEHOLDER,
    resolveAiIdentityRole,
    SNOWFLAKE_LOGIN_PLACEHOLDER,
    type AiIdentityRoleMapping,
} from '@lightdash/common';

export const selectAiIdentityRole = (
    identity: {
        provisionedRole: string | null;
        groupUuids: string[];
        snowflakeLogin: string | null;
        twinName: string | null;
    },
    mappings: AiIdentityRoleMapping[],
    roleTemplate: string | null,
): string | null => {
    if (identity.provisionedRole !== null) return identity.provisionedRole;
    const roles = [
        ...new Set(
            mappings
                .filter((mapping) =>
                    identity.groupUuids.includes(mapping.groupUuid),
                )
                .map((mapping) => mapping.aiRole.toUpperCase()),
        ),
    ];
    if (roles.length > 1) return null;
    if (roles.length === 1) return roles[0];
    if (
        roleTemplate === null ||
        (roleTemplate.includes(SNOWFLAKE_LOGIN_PLACEHOLDER) &&
            identity.snowflakeLogin === null) ||
        (roleTemplate.includes(AI_IDENTITY_NAME_PLACEHOLDER) &&
            identity.twinName === null)
    )
        return null;
    return resolveAiIdentityRole(
        roleTemplate,
        identity.snowflakeLogin,
        identity.twinName,
    );
};
