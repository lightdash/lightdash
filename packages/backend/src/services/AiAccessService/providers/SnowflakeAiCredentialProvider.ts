import {
    AiAccessRefusalReason,
    AiAccessRefusedError,
    AiCredentialMethod,
    AiPrincipalFailureReason,
    AiPrincipalKind,
    AiSetupScriptFormat,
    assertUnreachable,
    SnowflakeAuthenticationType,
    UnexpectedServerError,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
    type AiAssurance,
    type AiProbeResult,
    type AiSetupScript,
    type AiWarehouseCapabilities,
    type CreateSnowflakeCredentials,
} from '@lightdash/common';
import {
    checkSnowflakeAgentSessionWithToken,
    SNOWFLAKE_AGENT_SESSION_REQUIRED_MESSAGE,
} from '@lightdash/warehouses';
import { mergePersonalWarehouseCredentials } from '../../ProjectService/personalWarehouseCredentials';
import { UserService } from '../../UserService';
import {
    type AiCredentialProvider,
    type AiMintArgs,
    type AiMintedCredentials,
    type AiSetupScriptArgs,
} from './AiCredentialProvider';
import { type AiCredentialProviderDependencies } from './registry';

export class SnowflakeAiCredentialProvider implements AiCredentialProvider<CreateSnowflakeCredentials> {
    readonly warehouseType = WarehouseTypes.SNOWFLAKE;

    constructor(private readonly deps: AiCredentialProviderDependencies) {}

    capabilities(): AiWarehouseCapabilities {
        const { clientId, clientSecret, authorizationEndpoint, tokenEndpoint } =
            this.deps.lightdashConfig.auth.snowflakeAi;
        const unavailable = {
            available: false as const,
            reason: 'SERVICE_AGENT principals for Snowflake come in the next version.',
        };
        return {
            warehouseType: this.warehouseType,
            principals: {
                person:
                    clientId &&
                    clientSecret &&
                    authorizationEndpoint &&
                    tokenEndpoint
                        ? {
                              available: true,
                              method: AiCredentialMethod.SIGN_IN,
                          }
                        : {
                              available: false,
                              reason: 'The Snowflake sign-in for AI is not configured on this instance. Set the SNOWFLAKE_AI_OAUTH_* settings.',
                          },
                twin: unavailable,
                group: unavailable,
                shared: unavailable,
            },
            transports: {
                direct: { available: true },
                procedure: {
                    available: false,
                    reason: 'The restricted caller procedure transport comes in the next version.',
                },
            },
            setupFormat: AiSetupScriptFormat.SQL,
        };
    }

    async createSecret(): Promise<null> {
        return null;
    }

    async missingPrerequisite({
        person,
    }: AiMintArgs<CreateSnowflakeCredentials>): Promise<AiAccessRefusalReason | null> {
        const credential =
            await this.deps.userWarehouseCredentialsModel.findAiCredentialWithSecrets(
                {
                    userUuid: person.userUuid,
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                },
            );
        return credential ? null : AiAccessRefusalReason.NEEDS_SIGN_IN;
    }

    async mint({
        connection,
        principal,
        person,
    }: AiMintArgs<CreateSnowflakeCredentials>): Promise<
        AiMintedCredentials<CreateSnowflakeCredentials>
    > {
        if (principal.kind !== AiPrincipalKind.PERSON)
            throw new UnexpectedServerError(
                'Snowflake only supports person AI principals.',
            );
        const credential =
            await this.deps.userWarehouseCredentialsModel.findAiCredentialWithSecrets(
                {
                    userUuid: person.userUuid,
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                },
            );
        if (!credential)
            throw new AiAccessRefusedError(AiAccessRefusalReason.NEEDS_SIGN_IN);
        const merged = mergePersonalWarehouseCredentials(
            connection,
            credential,
        );
        if (
            merged.type !== WarehouseTypes.SNOWFLAKE ||
            merged.authenticationType !== SnowflakeAuthenticationType.SSO ||
            !merged.refreshToken
        )
            throw new AiAccessRefusedError(AiAccessRefusalReason.NEEDS_SIGN_IN);
        const { accessToken, refreshToken } =
            await UserService.generateSnowflakeAccessToken(
                merged.refreshToken,
                UserWarehouseCredentialPurpose.AI,
            );
        if (refreshToken !== merged.refreshToken)
            await this.deps.userWarehouseCredentialsModel.rotateRefreshToken(
                credential.uuid,
                merged.refreshToken,
                refreshToken,
            );
        return {
            credentials: {
                ...merged,
                token: accessToken,
                refreshToken,
                requireAgentSession: true,
                requireUserCredentials: false,
            },
            assurances: [
                { kind: 'agent_session_active' },
                { kind: 'result_cache_off' },
            ],
            expiresAt: null,
        };
    }

    async probe(
        credentials: CreateSnowflakeCredentials,
        assurances: AiAssurance[],
    ): Promise<AiProbeResult> {
        for (const assurance of assurances) {
            switch (assurance.kind) {
                case 'agent_session_active':
                case 'result_cache_off':
                case 'restricted_session_scope_active':
                    break;
                case 'current_user_is':
                case 'group_member':
                case 'procedure_present':
                    throw new UnexpectedServerError(
                        'Snowflake cannot verify this AI principal assurance.',
                    );
                default:
                    assertUnreachable(
                        assurance,
                        'Unknown AI principal assurance',
                    );
            }
        }
        if (!credentials.token)
            return {
                ok: false,
                checkedAt: new Date(),
                reason: AiPrincipalFailureReason.CREDENTIAL_REJECTED,
                message: 'Snowflake AI access requires an access token.',
                observed: {
                    current_role: null,
                    active_restricted_session_scopes: null,
                },
            };
        const session = await checkSnowflakeAgentSessionWithToken(
            credentials.account,
            credentials.token,
        );
        const observed = {
            current_role: session.currentRole,
            active_restricted_session_scopes:
                session.activeRestrictedSessionScopes,
        };
        for (const assurance of assurances) {
            if (
                (assurance.kind === 'agent_session_active' ||
                    assurance.kind === 'result_cache_off') &&
                !session.agentActivated
            )
                return {
                    ok: false,
                    checkedAt: new Date(),
                    reason: AiPrincipalFailureReason.NOT_AGENT_SESSION,
                    message: SNOWFLAKE_AGENT_SESSION_REQUIRED_MESSAGE,
                    observed,
                };
            if (
                assurance.kind === 'restricted_session_scope_active' &&
                !session.activeRestrictedSessionScopes?.trim()
            )
                return {
                    ok: false,
                    checkedAt: new Date(),
                    reason: AiPrincipalFailureReason.NO_RESTRICTED_SESSION_SCOPE,
                    message:
                        'The Snowflake AI session has no active restricted session scope.',
                    observed,
                };
        }
        return { ok: true, checkedAt: new Date(), observed };
    }

    setupScript(
        _args: AiSetupScriptArgs<CreateSnowflakeCredentials>,
    ): AiSetupScript {
        const { siteUrl, auth } = this.deps.lightdashConfig;
        const callbackUrl =
            `${siteUrl.replace(/\/$/, '')}/api/v1${auth.snowflakeAi.callbackPath}`.replaceAll(
                "'",
                "''",
            );
        return {
            format: AiSetupScriptFormat.SQL,
            parts: [
                {
                    title: 'Create the AI security integration',
                    body: `CREATE SECURITY INTEGRATION LIGHTDASH_AI
  TYPE = OAUTH
  OAUTH_CLIENT = CUSTOM
  OAUTH_CLIENT_TYPE = 'CONFIDENTIAL'
  OAUTH_REDIRECT_URI = '${callbackUrl}'
  ENABLED = TRUE
  IS_AGENTIC = TRUE
  OAUTH_ISSUE_REFRESH_TOKENS = TRUE
  OAUTH_REFRESH_TOKEN_VALIDITY = 7776000;
-- Then set SNOWFLAKE_AI_OAUTH_CLIENT_ID, SNOWFLAKE_AI_OAUTH_CLIENT_SECRET, SNOWFLAKE_AI_OAUTH_AUTHORIZATION_ENDPOINT and SNOWFLAKE_AI_OAUTH_TOKEN_ENDPOINT on this instance.`,
                },
                {
                    title: 'Apply the agent session controls',
                    body: `CREATE SESSION POLICY <agent_session_policy>
  AGENT_RESTRICTED_SESSION_SCOPE = '<restricted_session_scope>';
ALTER ACCOUNT SET SESSION POLICY <agent_session_policy>;
-- A user-level session policy replaces the account policy; do not set one on people who use AI.
CREATE MASKING POLICY <agent_masking_policy> AS (val STRING) RETURNS STRING ->
  CASE WHEN SYS_CONTEXT('SNOWFLAKE$CURRENT','IS_AGENT_ACTIVATED') = 'TRUE' THEN NULL ELSE val END;
ALTER TAG <protected_data_tag> SET MASKING POLICY <agent_masking_policy>;`,
                },
            ],
        };
    }
}
