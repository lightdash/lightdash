import {
    AI_IDENTITY_NAME_PLACEHOLDER,
    fillAiTwinName,
    resolveAiIdentityRole,
    SNOWFLAKE_LOGIN_PLACEHOLDER,
    type AiIdentity,
} from '@lightdash/common';

export type RoleMode = 'template' | 'none' | 'shared';

export const getRoleMode = (roleTemplate: string | null): RoleMode =>
    roleTemplate === null
        ? 'none'
        : roleTemplate.includes(SNOWFLAKE_LOGIN_PLACEHOLDER) ||
            roleTemplate.includes(AI_IDENTITY_NAME_PLACEHOLDER)
          ? 'template'
          : 'shared';

export const getIdentityPreview = (
    identity: AiIdentity,
    nameTemplate: string,
    roleTemplate: string | null,
): { name: string; role: string } => {
    const name =
        identity.twinNameOverride ??
        (identity.snowflakeLogin === null
            ? null
            : fillAiTwinName(nameTemplate, identity.snowflakeLogin));
    if (roleTemplate === null)
        return {
            name: name ?? 'Needs sign-in',
            role: 'No roles in the script',
        };
    if (
        (roleTemplate.includes(SNOWFLAKE_LOGIN_PLACEHOLDER) &&
            identity.snowflakeLogin === null) ||
        (roleTemplate.includes(AI_IDENTITY_NAME_PLACEHOLDER) && name === null)
    )
        return {
            name: name ?? 'Needs sign-in',
            role: 'Skipped: no Snowflake login recorded',
        };
    try {
        return {
            name: name ?? 'Needs sign-in',
            role:
                resolveAiIdentityRole(
                    roleTemplate,
                    identity.snowflakeLogin,
                    name,
                ) ?? 'No roles in the script',
        };
    } catch {
        return {
            name: name ?? 'Needs sign-in',
            role: 'Invalid role for this person',
        };
    }
};
