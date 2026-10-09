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
    type UserWarehouseCredentialsWithSecrets,
} from '@lightdash/common';
import {
    checkSnowflakeAgentSessionWithToken,
    SNOWFLAKE_AGENT_SESSION_REQUIRED_MESSAGE,
} from '@lightdash/warehouses';
import {
    classifySnowflakeRefreshError,
    exchangeSnowflakeRefreshToken,
    type SnowflakeRefreshResult,
} from '../../../auth/snowflakeOAuthRefresh';
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
        silentRefresh,
    }: AiMintArgs<CreateSnowflakeCredentials>): Promise<AiAccessRefusalReason | null> {
        const credential =
            await this.deps.userWarehouseCredentialsModel.findAiCredentialWithSecrets(
                {
                    userUuid: person.userUuid,
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                },
            );
        if (!credential) return AiAccessRefusalReason.NEEDS_SIGN_IN;
        return !silentRefresh &&
            credential.expiresAt &&
            credential.expiresAt.getTime() <= Date.now()
            ? AiAccessRefusalReason.SIGN_IN_EXPIRED
            : null;
    }

    async mint({
        connection,
        person,
        silentRefresh,
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
        if (
            !silentRefresh &&
            credential.expiresAt &&
            credential.expiresAt.getTime() <= Date.now()
        )
            throw new AiAccessRefusedError(
                AiAccessRefusalReason.SIGN_IN_EXPIRED,
            );
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
        if (silentRefresh) {
            const refreshed = await this.refreshCredential(
                connection,
                credential,
                person.userUuid,
                true,
            );
            return {
                identityUuid: refreshed.credential.uuid,
                credentials: {
                    ...refreshed.merged,
                    token: refreshed.tokens.accessToken,
                    refreshToken: refreshed.tokens.refreshToken,
                    requireAgentSession: true,
                    requireUserCredentials: false,
                },
                assurances: [
                    { kind: 'agent_session_active' },
                    { kind: 'result_cache_off' },
                ],
                expiresAt:
                    refreshed.tokens.accessTokenExpiresAt ??
                    new Date(Date.now() + 8 * 60 * 1000),
            };
        }
        const { accessToken, refreshToken } =
            await UserService.generateSnowflakeAccessToken(
                merged.refreshToken,
                UserWarehouseCredentialPurpose.AI,
            ).catch((error: { data?: string; message?: string } | null) => {
                const invalidGrant = /\binvalid_grant\b/.test(
                    `${error?.data ?? ''} ${error?.message ?? ''}`,
                );
                throw new AiAccessRefusedError(
                    invalidGrant
                        ? AiAccessRefusalReason.SIGN_IN_EXPIRED
                        : AiAccessRefusalReason.NEEDS_SIGN_IN,
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

    private async refreshCredential(
        connection: CreateSnowflakeCredentials,
        credential: UserWarehouseCredentialsWithSecrets,
        userUuid: string,
        retryRotation: boolean,
    ): Promise<{
        credential: UserWarehouseCredentialsWithSecrets;
        tokens: SnowflakeRefreshResult;
        merged: CreateSnowflakeCredentials;
    }> {
        const credentials = mergePersonalWarehouseCredentials(
            connection,
            credential,
        );
        if (
            credentials.type !== WarehouseTypes.SNOWFLAKE ||
            credentials.authenticationType !==
                SnowflakeAuthenticationType.SSO ||
            !credentials.refreshToken
        )
            throw new AiAccessRefusedError(AiAccessRefusalReason.NEEDS_SIGN_IN);
        const oldRefreshToken = credentials.refreshToken;
        let tokens: SnowflakeRefreshResult;
        const now = new Date();
        try {
            tokens = await exchangeSnowflakeRefreshToken({
                strategyName: 'snowflake-ai',
                refreshToken: oldRefreshToken,
                now,
            });
        } catch (error) {
            const failure = classifySnowflakeRefreshError(error);
            switch (failure.kind) {
                case 'grant_gone': {
                    if (retryRotation) {
                        const current =
                            await this.deps.userWarehouseCredentialsModel.findAiCredentialWithSecrets(
                                {
                                    userUuid,
                                    warehouseType: WarehouseTypes.SNOWFLAKE,
                                },
                            );
                        const latest = current
                            ? mergePersonalWarehouseCredentials(
                                  connection,
                                  current,
                              )
                            : null;
                        if (
                            current &&
                            latest?.type === WarehouseTypes.SNOWFLAKE &&
                            latest.authenticationType ===
                                SnowflakeAuthenticationType.SSO &&
                            latest.refreshToken &&
                            latest.refreshToken !== oldRefreshToken
                        )
                            return this.refreshCredential(
                                connection,
                                current,
                                userUuid,
                                false,
                            );
                    }
                    throw new AiAccessRefusedError(
                        AiAccessRefusalReason.SIGN_IN_EXPIRED,
                    );
                }
                case 'temporary':
                    throw new UnexpectedServerError(
                        'The warehouse sign-in could not be refreshed. Try again in a moment.',
                        {
                            code: 'warehouse_oauth_refresh_failed',
                            retryable: true,
                        },
                    );
                case 'configuration':
                    throw new AiAccessRefusedError(
                        AiAccessRefusalReason.NEEDS_SIGN_IN,
                    );
                default:
                    return assertUnreachable(
                        failure,
                        'Unknown Snowflake refresh failure',
                    );
            }
        }
        const expiresAt =
            tokens.refreshTokenExpiresAt ??
            (credential.expiresAt &&
            credential.expiresAt.getTime() <= Date.now()
                ? null
                : credential.expiresAt);
        if (
            tokens.refreshToken !== oldRefreshToken ||
            expiresAt?.getTime() !== credential.expiresAt?.getTime()
        )
            await this.deps.userWarehouseCredentialsModel.rotateRefreshToken(
                credential.uuid,
                oldRefreshToken,
                tokens.refreshToken,
                expiresAt,
            );
        return { credential, tokens, merged: credentials };
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
