export enum AiIdentityStatus {
    PENDING = 'pending',
    READY = 'ready',
    FAILED = 'failed',
}

export const SNOWFLAKE_LOGIN_PLACEHOLDER = '{snowflake_login}';

export const DEFAULT_AI_TWIN_NAME_TEMPLATE = `${SNOWFLAKE_LOGIN_PLACEHOLDER}_AI`;

export type AiIdentitySettings = {
    twinNameTemplate: string | null;
};

export type AiIdentity = {
    aiIdentityUuid: string;
    userUuid: string;
    email: string;
    firstName: string;
    lastName: string;
    snowflakeLogin: string | null;
    twinNameOverride: string | null;
    twinName: string | null;
    publicKey: string;
    publicKeyFingerprint: string;
    status: AiIdentityStatus;
    statusMessage: string | null;
    checkedAt: Date | null;
};

export type AiIdentityMemberWithoutIdentity = {
    userUuid: string;
    email: string;
    firstName: string;
    lastName: string;
};

export type AiIdentitiesSummary = {
    settings: AiIdentitySettings;
    identities: AiIdentity[];
    membersWithoutIdentity: AiIdentityMemberWithoutIdentity[];
};

export type UpdateAiIdentitySettings = AiIdentitySettings;

export type UpdateAiIdentity = {
    twinNameOverride: string | null;
};

export type ApiAiIdentitiesResponse = {
    status: 'ok';
    results: AiIdentitiesSummary;
};

export type ApiAiIdentityResponse = {
    status: 'ok';
    results: AiIdentity;
};

export type ApiAiIdentitySettingsResponse = {
    status: 'ok';
    results: AiIdentitySettings;
};

export type ApiAiIdentitiesSqlResponse = {
    status: 'ok';
    results: { sql: string };
};

export const fillAiTwinName = (
    template: string,
    snowflakeLogin: string,
): string => template.split(SNOWFLAKE_LOGIN_PLACEHOLDER).join(snowflakeLogin);

export const resolveAiTwinName = ({
    twinNameOverride,
    twinNameTemplate,
    snowflakeLogin,
}: {
    twinNameOverride: string | null;
    twinNameTemplate: string | null;
    snowflakeLogin: string | null;
}): string | null => {
    if (twinNameOverride !== null) return twinNameOverride;
    if (twinNameTemplate === null || snowflakeLogin === null) return null;
    return fillAiTwinName(twinNameTemplate, snowflakeLogin);
};
