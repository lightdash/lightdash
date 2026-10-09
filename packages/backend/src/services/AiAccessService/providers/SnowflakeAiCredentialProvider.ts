import {
    AiAccessRefusalReason,
    AiAccessRefusedError,
    assertUnreachable,
    FeatureFlags,
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
import {
    classifySnowflakeRefreshError,
    exchangeSnowflakeRefreshToken,
    type SnowflakeRefreshResult,
} from '../../../auth/snowflakeOAuthRefresh';
import Logger from '../../../logging/logger';
import { redactCredentialError } from '../../../logging/redactCredentialError';
import { withCause } from '../../../logging/withCause';
import {
    RefreshTokenLockTimeoutError,
    RefreshTokenRowMissingError,
} from '../../../models/RefreshTokenRotation/RefreshTokenRotation';
import { type AiUserWarehouseCredentials } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { SnowflakeOAuthRefresher } from '../../OAuthRefresh/SnowflakeOAuthRefresher';
import { mergePersonalWarehouseCredentials } from '../../ProjectService/personalWarehouseCredentials';
import { type AiAccessEvaluation } from '../AiAccessService';
import { type ResolvedSnowflakeAgentClient } from '../SnowflakeAgentClientResolver';
import {
    AiSessionFailureReason,
    type AiCredentialProvider,
    type AiMintArgs,
    type AiMintedCredentials,
    type AiSessionProbeResult,
} from './AiCredentialProvider';
import { type AiCredentialProviderDependencies } from './registry';

class AgentRefreshExchangeError extends Error {
    constructor(readonly original: unknown) {
        super('Agent sign-in refresh failed');
    }
}

const waitForRefreshRotation = () =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, 300);
    });

export class SnowflakeAiCredentialProvider implements AiCredentialProvider<CreateSnowflakeCredentials> {
    readonly warehouseType = WarehouseTypes.SNOWFLAKE;

    constructor(private readonly deps: AiCredentialProviderDependencies) {}

    async configurationError(organizationUuid: string): Promise<string | null> {
        return (await this.deps.snowflakeAgentClientResolver.resolve(
            organizationUuid,
        ))
            ? null
            : 'The Snowflake agent connection is not configured for this organisation. An organisation admin can add the OAuth client in Agent identity settings.';
    }

    private matchesClient(
        credential: AiUserWarehouseCredentials,
        client: ResolvedSnowflakeAgentClient,
    ): boolean {
        return (
            (credential.aiClientBinding?.clientVersion ?? null) ===
                client.clientVersion &&
            (!credential.aiClientBinding ||
                credential.aiClientBinding.organizationUuid ===
                    client.organizationUuid)
        );
    }

    async missingPrerequisite({
        person,
        silentRefresh,
    }: AiMintArgs<CreateSnowflakeCredentials>): Promise<AiAccessRefusalReason | null> {
        const client = await this.deps.snowflakeAgentClientResolver.resolve(
            person.organizationUuid,
        );
        const credential =
            await this.deps.userWarehouseCredentialsModel.findAiCredentialWithSecrets(
                {
                    userUuid: person.userUuid,
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                },
            );
        if (!client) return AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED;
        if (credential && !this.matchesClient(credential, client))
            return AiAccessRefusalReason.SIGN_IN_EXPIRED;
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
        organizationUuid,
        evaluationKind,
    }: AiMintArgs<CreateSnowflakeCredentials> & {
        organizationUuid: string;
        evaluationKind: AiAccessEvaluation['kind'];
    }): Promise<AiMintedCredentials<CreateSnowflakeCredentials>> {
        const client = await this.deps.snowflakeAgentClientResolver.resolve(
            person.organizationUuid,
        );
        const credential =
            await this.deps.userWarehouseCredentialsModel.findAiCredentialWithSecrets(
                {
                    userUuid: person.userUuid,
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                },
            );
        if (!client)
            throw new AiAccessRefusedError(
                AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED,
            );
        if (credential && !this.matchesClient(credential, client))
            throw new AiAccessRefusedError(
                AiAccessRefusalReason.SIGN_IN_EXPIRED,
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
        const { enabled: lockEnabled } = await this.deps.featureFlagModel.get({
            user: { organizationUuid: person.organizationUuid },
            featureFlagId: FeatureFlags.WarehouseOAuthRefreshLock,
        });
        if (lockEnabled) {
            return this.mintWithRefreshLock({
                refreshToken: merged.refreshToken,
                connection,
                credential,
                client,
                silentRefresh,
                userUuid: person.userUuid,
                organizationUuid,
                evaluationKind,
            });
        }
        if (silentRefresh) {
            const refreshed = await this.refreshCredential(
                connection,
                credential,
                { userUuid: person.userUuid, organizationUuid, evaluationKind },
                true,
                client,
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
            await exchangeSnowflakeRefreshToken({
                client,
                refreshToken: merged.refreshToken,
                now: new Date(),
            }).catch((error: { data?: string; message?: string } | null) => {
                const invalidGrant = /\binvalid_grant\b/.test(
                    `${error?.data ?? ''} ${error?.message ?? ''}`,
                );
                const reason = invalidGrant
                    ? AiAccessRefusalReason.SIGN_IN_EXPIRED
                    : AiAccessRefusalReason.NEEDS_SIGN_IN;
                Logger[evaluationKind === 'diagnostic' ? 'debug' : 'warn'](
                    'Agent sign-in refresh failed',
                    {
                        userUuid: person.userUuid,
                        organizationUuid,
                        reason,
                        ...redactCredentialError(error),
                    },
                );
                const refusal = new AiAccessRefusedError(reason);
                withCause(refusal, error);
                throw refusal;
            });
        Logger.info('Agent sign-in refreshed', {
            userUuid: person.userUuid,
            organizationUuid,
        });
        if (refreshToken !== merged.refreshToken) {
            const rotated =
                await this.deps.userWarehouseCredentialsModel.rotateRefreshToken(
                    credential.uuid,
                    merged.refreshToken,
                    refreshToken,
                );
            Logger[rotated ? 'info' : 'debug'](
                rotated
                    ? 'Agent sign-in refresh token rotated'
                    : 'Agent sign-in refresh token rotation skipped',
                {
                    userUuid: person.userUuid,
                    organizationUuid,
                },
            );
        }
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

    private async mintWithRefreshLock({
        refreshToken,
        connection,
        credential,
        client,
        silentRefresh,
        userUuid,
        organizationUuid,
        evaluationKind,
    }: {
        refreshToken: string;
        connection: CreateSnowflakeCredentials;
        credential: AiUserWarehouseCredentials;
        client: ResolvedSnowflakeAgentClient;
        silentRefresh: boolean;
        userUuid: string;
        organizationUuid: string;
        evaluationKind: AiAccessEvaluation['kind'];
    }): Promise<AiMintedCredentials<CreateSnowflakeCredentials>> {
        let currentCredential = credential;
        const refresher = new SnowflakeOAuthRefresher(
            this.deps.refreshTokenRotation,
        );
        let tokens: SnowflakeRefreshResult;
        try {
            tokens = await refresher.refresh({
                refreshToken,
                row: {
                    key: {
                        kind: 'user',
                        uuid: credential.uuid,
                        purpose: UserWarehouseCredentialPurpose.AI,
                    },
                    shareKey: JSON.stringify([
                        'snowflake-agent',
                        client.organizationUuid,
                        client.clientVersion,
                        silentRefresh,
                    ]),
                    readCurrentRefreshToken: async () => {
                        const current =
                            await this.deps.userWarehouseCredentialsModel.findAiCredentialWithSecrets(
                                {
                                    userUuid,
                                    warehouseType: WarehouseTypes.SNOWFLAKE,
                                },
                            );
                        if (current && !this.matchesClient(current, client))
                            throw new AiAccessRefusedError(
                                AiAccessRefusalReason.SIGN_IN_EXPIRED,
                            );
                        if (!current || current.uuid !== credential.uuid)
                            return null;
                        if (
                            !silentRefresh &&
                            current.expiresAt &&
                            current.expiresAt.getTime() <= Date.now()
                        )
                            throw new AiAccessRefusedError(
                                AiAccessRefusalReason.SIGN_IN_EXPIRED,
                            );
                        currentCredential = current;
                        const merged = mergePersonalWarehouseCredentials(
                            connection,
                            current,
                        );
                        return merged.type === WarehouseTypes.SNOWFLAKE &&
                            merged.authenticationType ===
                                SnowflakeAuthenticationType.SSO
                            ? (merged.refreshToken ?? null)
                            : null;
                    },
                },
                exchange: async (currentRefreshToken) => {
                    try {
                        return await exchangeSnowflakeRefreshToken({
                            client,
                            refreshToken: currentRefreshToken,
                            now: new Date(),
                        });
                    } catch (error) {
                        throw new AgentRefreshExchangeError(error);
                    }
                },
                persist: async ({ lockedRefreshToken, result }) => {
                    Logger.info('Agent sign-in refreshed', {
                        userUuid,
                        organizationUuid,
                    });
                    const tokenChanged =
                        result.refreshToken !== lockedRefreshToken;
                    if (
                        tokenChanged ||
                        (silentRefresh &&
                            ((result.refreshTokenExpiresAt &&
                                result.refreshTokenExpiresAt.getTime() !==
                                    currentCredential.expiresAt?.getTime()) ||
                                (currentCredential.expiresAt &&
                                    currentCredential.expiresAt.getTime() <=
                                        Date.now())))
                    ) {
                        const rotated = silentRefresh
                            ? await this.deps.userWarehouseCredentialsModel.rotateRefreshToken(
                                  credential.uuid,
                                  lockedRefreshToken,
                                  result.refreshToken,
                                  result.refreshTokenExpiresAt
                                      ? {
                                            kind: 'reported',
                                            expiresAt:
                                                result.refreshTokenExpiresAt,
                                        }
                                      : { kind: 'unreported' },
                              )
                            : await this.deps.userWarehouseCredentialsModel.rotateRefreshToken(
                                  credential.uuid,
                                  lockedRefreshToken,
                                  result.refreshToken,
                              );
                        if (tokenChanged)
                            Logger[rotated ? 'info' : 'debug'](
                                rotated
                                    ? 'Agent sign-in refresh token rotated'
                                    : 'Agent sign-in refresh token rotation skipped',
                                { userUuid, organizationUuid },
                            );
                    }
                },
            });
        } catch (error) {
            if (error instanceof RefreshTokenRowMissingError)
                throw withCause(
                    new AiAccessRefusedError(
                        AiAccessRefusalReason.NEEDS_SIGN_IN,
                    ),
                    error,
                );
            if (
                !(error instanceof AgentRefreshExchangeError) &&
                !(error instanceof RefreshTokenLockTimeoutError)
            )
                throw error;
            const cause =
                error instanceof AgentRefreshExchangeError
                    ? error.original
                    : error;
            if (
                !silentRefresh &&
                !(error instanceof RefreshTokenLockTimeoutError)
            ) {
                const detail = cause as {
                    data?: string;
                    message?: string;
                } | null;
                const invalidGrant = /\binvalid_grant\b/.test(
                    `${detail?.data ?? ''} ${detail?.message ?? ''}`,
                );
                const reason = invalidGrant
                    ? AiAccessRefusalReason.SIGN_IN_EXPIRED
                    : AiAccessRefusalReason.NEEDS_SIGN_IN;
                Logger[evaluationKind === 'diagnostic' ? 'debug' : 'warn'](
                    'Agent sign-in refresh failed',
                    {
                        userUuid,
                        organizationUuid,
                        reason,
                        ...redactCredentialError(cause),
                    },
                );
                throw withCause(new AiAccessRefusedError(reason), cause);
            }
            const failure = classifySnowflakeRefreshError(cause);
            Logger[evaluationKind === 'diagnostic' ? 'debug' : 'warn'](
                'Agent sign-in refresh failed',
                {
                    userUuid,
                    organizationUuid,
                    kind: failure.kind,
                    ...redactCredentialError(cause),
                },
            );
            switch (failure.kind) {
                case 'grant_gone':
                    throw withCause(
                        new AiAccessRefusedError(
                            AiAccessRefusalReason.SIGN_IN_EXPIRED,
                        ),
                        cause,
                    );
                case 'temporary':
                    throw withCause(
                        new UnexpectedServerError(
                            'The warehouse sign-in could not be refreshed. Try again in a moment.',
                            {
                                code: 'warehouse_oauth_refresh_failed',
                                retryable: true,
                            },
                        ),
                        cause,
                    );
                case 'configuration':
                    throw withCause(
                        new AiAccessRefusedError(
                            AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED,
                            {
                                message:
                                    'The warehouse OAuth client was rejected. Ask an administrator to check the agent sign-in settings.',
                            },
                        ),
                        cause,
                    );
                default:
                    return assertUnreachable(
                        failure,
                        'Unknown Snowflake refresh failure',
                    );
            }
        }
        const merged = mergePersonalWarehouseCredentials(
            connection,
            currentCredential,
        );
        if (merged.type !== WarehouseTypes.SNOWFLAKE)
            throw new AiAccessRefusedError(AiAccessRefusalReason.NEEDS_SIGN_IN);
        return {
            identityUuid: credential.uuid,
            credentials: {
                ...merged,
                token: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                requireAgentSession: true,
                requireUserCredentials: false,
            },
            assurances: [
                { kind: 'agent_session_active' },
                { kind: 'result_cache_off' },
            ],
            expiresAt:
                (silentRefresh && tokens.accessTokenExpiresAt) ||
                new Date(Date.now() + 8 * 60 * 1000),
        };
    }

    private async findRotatedCredential(
        connection: CreateSnowflakeCredentials,
        userUuid: string,
        oldRefreshToken: string,
        remainingReads: number,
    ): Promise<AiUserWarehouseCredentials | null> {
        const current =
            await this.deps.userWarehouseCredentialsModel.findAiCredentialWithSecrets(
                {
                    userUuid,
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                },
            );
        const latest = current
            ? mergePersonalWarehouseCredentials(connection, current)
            : null;
        if (
            current &&
            latest?.type === WarehouseTypes.SNOWFLAKE &&
            latest.authenticationType === SnowflakeAuthenticationType.SSO &&
            latest.refreshToken &&
            latest.refreshToken !== oldRefreshToken
        )
            return current;
        if (remainingReads <= 1) return null;
        await waitForRefreshRotation();
        return this.findRotatedCredential(
            connection,
            userUuid,
            oldRefreshToken,
            remainingReads - 1,
        );
    }

    private async refreshCredential(
        connection: CreateSnowflakeCredentials,
        credential: AiUserWarehouseCredentials,
        logContext: {
            userUuid: string;
            organizationUuid: string;
            evaluationKind: AiAccessEvaluation['kind'];
        },
        retryRotation: boolean,
        client: ResolvedSnowflakeAgentClient,
    ): Promise<{
        credential: AiUserWarehouseCredentials;
        tokens: SnowflakeRefreshResult;
        merged: CreateSnowflakeCredentials;
    }> {
        if (!this.matchesClient(credential, client))
            throw new AiAccessRefusedError(
                AiAccessRefusalReason.SIGN_IN_EXPIRED,
            );
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
                client,
                refreshToken: oldRefreshToken,
                now,
            });
        } catch (error) {
            const failure = classifySnowflakeRefreshError(error);
            const logRefreshFailure = () =>
                Logger[
                    logContext.evaluationKind === 'diagnostic'
                        ? 'debug'
                        : 'warn'
                ]('Agent sign-in refresh failed', {
                    userUuid: logContext.userUuid,
                    organizationUuid: logContext.organizationUuid,
                    kind: failure.kind,
                    ...redactCredentialError(error),
                });
            switch (failure.kind) {
                case 'grant_gone': {
                    if (retryRotation) {
                        const current = await this.findRotatedCredential(
                            connection,
                            logContext.userUuid,
                            oldRefreshToken,
                            3,
                        );
                        if (current)
                            return this.refreshCredential(
                                connection,
                                current,
                                logContext,
                                false,
                                client,
                            );
                    }
                    logRefreshFailure();
                    throw withCause(
                        new AiAccessRefusedError(
                            AiAccessRefusalReason.SIGN_IN_EXPIRED,
                        ),
                        error,
                    );
                }
                case 'temporary':
                    logRefreshFailure();
                    throw withCause(
                        new UnexpectedServerError(
                            'The warehouse sign-in could not be refreshed. Try again in a moment.',
                            {
                                code: 'warehouse_oauth_refresh_failed',
                                retryable: true,
                            },
                        ),
                        error,
                    );
                case 'configuration':
                    logRefreshFailure();
                    throw withCause(
                        new AiAccessRefusedError(
                            AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED,
                            {
                                message:
                                    'The warehouse OAuth client was rejected. Ask an administrator to check the agent sign-in settings.',
                            },
                        ),
                        error,
                    );
                default:
                    return assertUnreachable(
                        failure,
                        'Unknown Snowflake refresh failure',
                    );
            }
        }
        Logger.info('Agent sign-in refreshed', {
            userUuid: logContext.userUuid,
            organizationUuid: logContext.organizationUuid,
        });
        if (
            tokens.refreshToken !== oldRefreshToken ||
            (tokens.refreshTokenExpiresAt &&
                tokens.refreshTokenExpiresAt.getTime() !==
                    credential.expiresAt?.getTime()) ||
            (credential.expiresAt &&
                credential.expiresAt.getTime() <= Date.now())
        ) {
            const rotated =
                await this.deps.userWarehouseCredentialsModel.rotateRefreshToken(
                    credential.uuid,
                    oldRefreshToken,
                    tokens.refreshToken,
                    tokens.refreshTokenExpiresAt
                        ? {
                              kind: 'reported',
                              expiresAt: tokens.refreshTokenExpiresAt,
                          }
                        : { kind: 'unreported' },
                );
            if (tokens.refreshToken !== oldRefreshToken)
                Logger[rotated ? 'info' : 'debug'](
                    rotated
                        ? 'Agent sign-in refresh token rotated'
                        : 'Agent sign-in refresh token rotation skipped',
                    {
                        userUuid: logContext.userUuid,
                        organizationUuid: logContext.organizationUuid,
                    },
                );
        }
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
                cause: null,
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
                cause: error,
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
                    cause: null,
                    checkedAt: new Date(),
                    reason: AiSessionFailureReason.NOT_AGENT_SESSION,
                    message: SNOWFLAKE_AGENT_SESSION_REQUIRED_MESSAGE,
                    observed,
                };
        }
        return { ok: true, checkedAt: new Date(), observed };
    }
}
