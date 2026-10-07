import {
    AiAccessRefusalReason,
    AiAccessRefusedError,
    assertUnreachable,
    SnowflakeAuthenticationType,
    UnexpectedServerError,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
    type AiAssurance,
    type CreateSnowflakeCredentials,
} from '@lightdash/common';
import {
    checkSnowflakeAgentSessionWithToken,
    SNOWFLAKE_AGENT_SESSION_REQUIRED_MESSAGE,
} from '@lightdash/warehouses';
import { mergePersonalWarehouseCredentials } from '../../ProjectService/personalWarehouseCredentials';
import { UserService } from '../../UserService';
import {
    AiSessionFailureReason,
    type AiCredentialProvider,
    type AiMintArgs,
    type AiMintedCredentials,
    type AiSessionProbeResult,
} from './AiCredentialProvider';
import { type AiCredentialProviderDependencies } from './registry';

export class SnowflakeAiCredentialProvider implements AiCredentialProvider<CreateSnowflakeCredentials> {
    readonly warehouseType = WarehouseTypes.SNOWFLAKE;

    constructor(private readonly deps: AiCredentialProviderDependencies) {}

    configurationError(): string | null {
        const { clientId, clientSecret, authorizationEndpoint, tokenEndpoint } =
            this.deps.lightdashConfig.auth.snowflakeAi;
        return clientId &&
            clientSecret &&
            authorizationEndpoint &&
            tokenEndpoint
            ? null
            : 'The Snowflake agent connection is not configured on this instance. Set the SNOWFLAKE_AI_OAUTH_* settings.';
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
        person,
    }: AiMintArgs<CreateSnowflakeCredentials>): Promise<
        AiMintedCredentials<CreateSnowflakeCredentials>
    > {
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
            ).catch(() => {
                throw new AiAccessRefusedError(
                    AiAccessRefusalReason.NEEDS_SIGN_IN,
                );
            });
        if (refreshToken !== merged.refreshToken)
            await this.deps.userWarehouseCredentialsModel.rotateRefreshToken(
                credential.uuid,
                merged.refreshToken,
                refreshToken,
            );
        return {
            identityUuid: credential.uuid,
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
            expiresAt: new Date(Date.now() + 8 * 60 * 1000),
        };
    }

    async probe(
        credentials: CreateSnowflakeCredentials,
        assurances: AiAssurance[],
    ): Promise<AiSessionProbeResult> {
        for (const assurance of assurances) {
            switch (assurance.kind) {
                case 'agent_session_active':
                case 'result_cache_off':
                    break;
                case 'agent_marker':
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
                transient: false,
                checkedAt: new Date(),
                reason: AiSessionFailureReason.CREDENTIAL_REJECTED,
                message: 'Snowflake AI access requires an access token.',
                observed: {
                    current_role: null,
                    active_restricted_session_scopes: null,
                },
            };
        let session: Awaited<
            ReturnType<typeof checkSnowflakeAgentSessionWithToken>
        >;
        try {
            session = await checkSnowflakeAgentSessionWithToken(
                credentials.account,
                credentials.token,
                { throwOnError: true, accessUrl: credentials.accessUrl },
            );
        } catch (error) {
            const detail =
                error instanceof Error ? error.message : String(error);
            let reason = AiSessionFailureReason.UNKNOWN;
            if (
                /invalid.*token|token.*expired|incorrect.*password|authentication failed/i.test(
                    detail,
                )
            )
                reason = AiSessionFailureReason.CREDENTIAL_REJECTED;
            else if (/\bdisabled\b|\blocked\b/i.test(detail))
                reason = AiSessionFailureReason.DISABLED_OR_LOCKED;
            else if (/network policy|ip.*not allowed/i.test(detail))
                reason = AiSessionFailureReason.NETWORK_POLICY;
            else if (
                /warehouse.*privilege|warehouse.*not.*exist|permission denied/i.test(
                    detail,
                )
            )
                reason = AiSessionFailureReason.WAREHOUSE_ACCESS;
            return {
                ok: false,
                transient: reason === AiSessionFailureReason.UNKNOWN,
                checkedAt: new Date(),
                reason,
                message: 'Snowflake could not verify the AI principal.',
                observed: {
                    current_role: null,
                    active_restricted_session_scopes: null,
                },
            };
        }
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
                    transient: false,
                    checkedAt: new Date(),
                    reason: AiSessionFailureReason.NOT_AGENT_SESSION,
                    message: SNOWFLAKE_AGENT_SESSION_REQUIRED_MESSAGE,
                    observed,
                };
        }
        return { ok: true, checkedAt: new Date(), observed };
    }
}
