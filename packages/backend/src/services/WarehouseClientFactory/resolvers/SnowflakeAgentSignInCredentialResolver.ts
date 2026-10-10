import {
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
import { z } from 'zod';
import {
    OAUTH_REQUEST_TIMEOUT_MS,
    OAuthRequestTimeoutError,
} from '../../../auth/oauthRequestDeadline';
import {
    classifySnowflakeRefreshError,
    exchangeSnowflakeRefreshToken,
    type SnowflakeRefreshResult,
} from '../../../auth/snowflakeOAuthRefresh';
import {
    RefreshTokenLockTimeoutError,
    RefreshTokenRowMissingError,
    RefreshTokenSourceChangedError,
    type RefreshTokenRotation,
} from '../../../models/RefreshTokenRotation/RefreshTokenRotation';
import type {
    AiUserWarehouseCredentials,
    PersonalCredentialPersistencePolicy,
    UserWarehouseCredentialsModel,
} from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import {
    AiSessionFailureReason,
    type AiSessionProbeResult,
} from '../../AiAccessService/agentSession';
import type {
    ResolvedSnowflakeAgentClient,
    SnowflakeAgentClientResolver,
} from '../../AiAccessService/SnowflakeAgentClientResolver';
import {
    OAuthCredentialRefresher,
    OAuthRefreshExchangeError,
} from '../../OAuthRefresh/OAuthCredentialRefresher';
import {
    OAuthCredentialRefreshSource,
    type OAuthCredentialRefreshSourceDependencies,
    type OAuthRefreshSourceCredentials,
} from '../../OAuthRefresh/OAuthCredentialRefreshSource';
import { mergePersonalWarehouseCredentials } from '../../ProjectService/personalWarehouseCredentials';
import type {
    CredentialResolution,
    CredentialResolver,
    CredentialSaveInput,
    CredentialSelection,
    DbtTargetResult,
    ValidatedCredential,
} from '../CredentialResolver';
import {
    composePersonalWarehouseCredentials,
    projectPersonalWarehouseCredentials,
} from '../personalCredentialOverlay';
import { resolvePersonalCredentialPolicy } from '../personalCredentialPolicy';
import { AgentCredentialResolutionError } from './AgentCredentialResolutionError';

export type AgentSignInRefreshEvent =
    | { kind: 'refreshed' }
    | { kind: 'rotation'; rotated: boolean };
export type AgentSignInInput = {
    person: { userUuid: string; organizationUuid: string; email: string };
    silentRefresh: boolean;
    onRefresh: (event: AgentSignInRefreshEvent) => void;
};
export type AgentSignInResolverDependencies =
    OAuthCredentialRefreshSourceDependencies & {
        refreshTokenRotation: Pick<RefreshTokenRotation, 'run'>;
        snowflakeAgentClientResolver: Pick<
            SnowflakeAgentClientResolver,
            'resolve'
        >;
        userWarehouseCredentialsModel: Pick<
            UserWarehouseCredentialsModel,
            | 'findAiCredentialWithSecrets'
            | 'getByUuidWithSecrets'
            | 'rotateRefreshToken'
        >;
    };
type Selection = CredentialSelection<
    CreateSnowflakeCredentials,
    AgentSignInInput
>;
type SnowflakeCredentials = Extract<
    OAuthRefreshSourceCredentials,
    { type: WarehouseTypes.SNOWFLAKE }
>;

const legacyRefreshErrorSchema = z.object({
    data: z.unknown().optional(),
    message: z.unknown().optional(),
});

const matchesClient = (
    credential: AiUserWarehouseCredentials,
    client: ResolvedSnowflakeAgentClient,
) =>
    (credential.aiClientBinding?.clientVersion ?? null) ===
        client.clientVersion &&
    (!credential.aiClientBinding ||
        credential.aiClientBinding.organizationUuid ===
            client.organizationUuid);

const validateCredential = (
    credential: AiUserWarehouseCredentials,
    client: ResolvedSnowflakeAgentClient,
    silentRefresh: boolean,
) => {
    if (!matchesClient(credential, client))
        throw new AgentCredentialResolutionError({
            kind: 'credential',
            classification: 'binding_mismatch',
        });
    if (
        !silentRefresh &&
        credential.expiresAt &&
        credential.expiresAt.getTime() <= Date.now()
    )
        throw new AgentCredentialResolutionError({
            kind: 'credential',
            classification: 'expired',
        });
};

export class SnowflakeAgentSignInCredentialResolver implements CredentialResolver<
    CreateSnowflakeCredentials,
    AgentSignInInput
> {
    constructor(private readonly deps: AgentSignInResolverDependencies) {}

    async inspectClient(
        organizationUuid: string,
    ): Promise<AgentCredentialResolutionError | null> {
        return (await this.deps.snowflakeAgentClientResolver.resolve(
            organizationUuid,
        ))
            ? null
            : new AgentCredentialResolutionError({
                  kind: 'client',
                  classification: 'missing',
              });
    }

    private async read(
        person: AgentSignInInput['person'],
        silentRefresh: boolean,
        policy: PersonalCredentialPersistencePolicy,
    ) {
        const client = await this.deps.snowflakeAgentClientResolver.resolve(
            person.organizationUuid,
        );
        const credential =
            await this.deps.userWarehouseCredentialsModel.findAiCredentialWithSecrets(
                {
                    userUuid: person.userUuid,
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                },
                policy,
            );
        if (!client)
            throw new AgentCredentialResolutionError({
                kind: 'client',
                classification: 'missing',
            });
        if (!credential)
            throw new AgentCredentialResolutionError({
                kind: 'credential',
                classification: 'missing',
            });
        validateCredential(credential, client, silentRefresh);
        return { client, credential };
    }

    async inspect(
        person: AgentSignInInput['person'],
        silentRefresh: boolean,
    ): Promise<AgentCredentialResolutionError | null> {
        try {
            const policy = await resolvePersonalCredentialPolicy(
                this.deps.featureFlagModel,
                person,
            );
            await this.read(person, silentRefresh, policy);
            return null;
        } catch (error) {
            if (error instanceof AgentCredentialResolutionError) return error;
            throw error;
        }
    }

    async validateOnSave(
        input: CredentialSaveInput<
            CreateSnowflakeCredentials,
            AgentSignInInput
        >,
    ): Promise<
        ValidatedCredential<CreateSnowflakeCredentials, AgentSignInInput>
    > {
        return { connection: input.connection, stored: input.stored };
    }

    async resolve(
        input: Selection,
    ): Promise<CredentialResolution<CreateSnowflakeCredentials>> {
        const { person, silentRefresh } = input.stored;
        const policy = await resolvePersonalCredentialPolicy(
            this.deps.featureFlagModel,
            {
                organizationUuid:
                    input.context.organizationUuid ?? person.organizationUuid,
                userUuid: person.userUuid,
            },
        );
        const { client, credential } = await this.read(
            person,
            silentRefresh,
            policy,
        );
        const refreshed = await this.refresh(
            input,
            credential,
            client,
            true,
            policy,
        );
        const credentials: CreateSnowflakeCredentials = {
            ...refreshed.merged,
            token: refreshed.tokens.accessToken,
            refreshToken: refreshed.tokens.refreshToken,
            requireAgentSession: true,
            requireUserCredentials: false,
        };
        const assurances: AiAssurance[] = [
            { kind: 'agent_session_active' },
            { kind: 'result_cache_off' },
        ];
        const session = await this.probe(credentials, assurances);
        if (!session.ok)
            throw new AgentCredentialResolutionError(
                { kind: 'session', session },
                session.cause,
            );
        return {
            clientCredentials: credentials,
            clientOptions: {},
            cacheable: true,
            agentSignIn: {
                credentialUuid: refreshed.credential.uuid,
                assurances,
                expiresAt:
                    (silentRefresh && refreshed.tokens.accessTokenExpiresAt) ||
                    new Date(Date.now() + 8 * 60 * 1000),
                clientVersion: client.clientVersion,
            },
        };
    }

    private async refresh(
        input: Selection,
        credential: AiUserWarehouseCredentials,
        client: ResolvedSnowflakeAgentClient,
        retryRotation: boolean,
        policy: PersonalCredentialPersistencePolicy,
    ): Promise<{
        credential: AiUserWarehouseCredentials;
        merged: CreateSnowflakeCredentials;
        tokens: SnowflakeRefreshResult;
    }> {
        const { person, silentRefresh, onRefresh } = input.stored;
        validateCredential(credential, client, silentRefresh);
        let currentCredential = credential;
        const merged = policy.strictPersonalOverlay
            ? composePersonalWarehouseCredentials(
                  input.connection,
                  projectPersonalWarehouseCredentials(credential.credentials),
              )
            : mergePersonalWarehouseCredentials(input.connection, credential);
        if (
            merged.type !== WarehouseTypes.SNOWFLAKE ||
            merged.authenticationType !== SnowflakeAuthenticationType.SSO ||
            !merged.refreshToken
        )
            throw new AgentCredentialResolutionError({
                kind: 'credential',
                classification: 'unusable',
            });
        const source = new OAuthCredentialRefreshSource<SnowflakeCredentials>(
            this.deps,
            {
                isCredential: (
                    credentials,
                ): credentials is SnowflakeCredentials =>
                    credentials.type === WarehouseTypes.SNOWFLAKE &&
                    credentials.authenticationType ===
                        SnowflakeAuthenticationType.SSO,
            },
            {
                kind: 'ai',
                userUuid: person.userUuid,
                model: this.deps.userWarehouseCredentialsModel,
                resolveCredential: (current) => {
                    if (!matchesClient(current, client))
                        throw new AgentCredentialResolutionError({
                            kind: 'credential',
                            classification: 'binding_mismatch',
                        });
                    if (current.uuid !== credential.uuid)
                        throw new RefreshTokenSourceChangedError();
                    validateCredential(current, client, silentRefresh);
                    currentCredential = current;
                    return policy.strictPersonalOverlay
                        ? composePersonalWarehouseCredentials(
                              input.connection,
                              projectPersonalWarehouseCredentials(
                                  current.credentials,
                              ),
                          )
                        : mergePersonalWarehouseCredentials(
                              input.connection,
                              current,
                          );
                },
            },
        );
        const owner = {
            kind: 'user' as const,
            uuid: credential.uuid,
            purpose: UserWarehouseCredentialPurpose.AI,
        };
        const lockEnabled =
            retryRotation && (await source.isLockEnabled(input, owner));
        const refresher = new OAuthCredentialRefresher(
            this.deps.refreshTokenRotation,
        );
        let tokens: SnowflakeRefreshResult;
        try {
            tokens = await refresher.refresh({
                refreshToken: merged.refreshToken,
                row: lockEnabled
                    ? {
                          key: owner,
                          shareKey: JSON.stringify([
                              'snowflake-agent',
                              client.organizationUuid,
                              client.clientVersion,
                              silentRefresh,
                          ]),
                          readCurrentRefreshToken: (trx) =>
                              source.readCurrentRefreshToken(
                                  {
                                      ...input,
                                      owner,
                                      refreshSource: {
                                          credentials: credential.credentials,
                                          fallback: input.connection,
                                          personalCredentialPolicy: policy,
                                      },
                                  },
                                  trx,
                              ),
                      }
                    : null,
                exchange: (refreshToken) =>
                    exchangeSnowflakeRefreshToken({
                        client,
                        refreshToken,
                        now: new Date(),
                        ...(lockEnabled
                            ? { requestTimeoutMs: OAUTH_REQUEST_TIMEOUT_MS }
                            : {}),
                    }),
                persist: async ({ lockedRefreshToken, result, trx }) => {
                    onRefresh({ kind: 'refreshed' });
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
                        const expiry = result.refreshTokenExpiresAt
                            ? {
                                  kind: 'reported' as const,
                                  expiresAt: result.refreshTokenExpiresAt,
                              }
                            : { kind: 'unreported' as const };
                        const rotated = await source.persist(
                            input,
                            owner,
                            lockedRefreshToken,
                            result.refreshToken,
                            trx,
                            silentRefresh ? expiry : null,
                        );
                        if (tokenChanged)
                            onRefresh({
                                kind: 'rotation',
                                rotated: rotated === true,
                            });
                    }
                },
            });
        } catch (error) {
            if (
                error instanceof RefreshTokenRowMissingError ||
                error instanceof RefreshTokenSourceChangedError
            )
                throw new AgentCredentialResolutionError(
                    { kind: 'credential', classification: 'source_changed' },
                    error,
                );
            if (
                !(error instanceof OAuthRefreshExchangeError) &&
                !(error instanceof RefreshTokenLockTimeoutError)
            )
                throw error;
            const cause =
                error instanceof OAuthRefreshExchangeError
                    ? error.originalError
                    : error;
            if (
                !silentRefresh &&
                !(
                    lockEnabled &&
                    (cause instanceof OAuthRequestTimeoutError ||
                        error instanceof RefreshTokenLockTimeoutError)
                )
            ) {
                const parsed = legacyRefreshErrorSchema.safeParse(cause);
                const detail = parsed.success ? parsed.data : null;
                const invalidGrant = /\binvalid_grant\b/.test(
                    `${detail?.data ?? ''} ${detail?.message ?? ''}`,
                );
                throw new AgentCredentialResolutionError(
                    {
                        kind: 'refresh',
                        classification: invalidGrant
                            ? 'legacy_grant_gone'
                            : 'legacy_failure',
                    },
                    cause,
                );
            }
            const failure = classifySnowflakeRefreshError(cause);
            if (
                !lockEnabled &&
                failure.kind === 'grant_gone' &&
                retryRotation
            ) {
                const sentToken =
                    error instanceof OAuthRefreshExchangeError
                        ? error.refreshToken
                        : merged.refreshToken;
                const current = await this.findRotatedCredential(
                    input.connection,
                    person.userUuid,
                    sentToken,
                    3,
                    policy,
                );
                if (current)
                    return this.refresh(input, current, client, false, policy);
            }
            throw new AgentCredentialResolutionError(
                { kind: 'refresh', classification: failure.kind },
                cause,
            );
        }
        const currentMerged = policy.strictPersonalOverlay
            ? composePersonalWarehouseCredentials(
                  input.connection,
                  projectPersonalWarehouseCredentials(
                      currentCredential.credentials,
                  ),
              )
            : mergePersonalWarehouseCredentials(
                  input.connection,
                  currentCredential,
              );
        if (currentMerged.type !== WarehouseTypes.SNOWFLAKE)
            throw new AgentCredentialResolutionError({
                kind: 'credential',
                classification: 'unusable',
            });
        return { credential: currentCredential, merged: currentMerged, tokens };
    }

    private async findRotatedCredential(
        connection: CreateSnowflakeCredentials,
        userUuid: string,
        oldRefreshToken: string,
        remainingReads: number,
        policy: PersonalCredentialPersistencePolicy,
    ): Promise<AiUserWarehouseCredentials | null> {
        const current =
            await this.deps.userWarehouseCredentialsModel.findAiCredentialWithSecrets(
                { userUuid, warehouseType: WarehouseTypes.SNOWFLAKE },
                policy,
            );
        const latest =
            current &&
            (policy.strictPersonalOverlay
                ? composePersonalWarehouseCredentials(
                      connection,
                      projectPersonalWarehouseCredentials(current.credentials),
                  )
                : mergePersonalWarehouseCredentials(connection, current));
        if (
            current &&
            latest?.type === WarehouseTypes.SNOWFLAKE &&
            latest.authenticationType === SnowflakeAuthenticationType.SSO &&
            latest.refreshToken &&
            latest.refreshToken !== oldRefreshToken
        )
            return current;
        if (remainingReads <= 1) return null;
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 300);
        });
        return this.findRotatedCredential(
            connection,
            userUuid,
            oldRefreshToken,
            remainingReads - 1,
            policy,
        );
    }

    cacheKeyIdentity(
        input: Selection,
        resolved: CredentialResolution<CreateSnowflakeCredentials>,
    ): readonly (string | null)[] {
        return [
            'snowflake-agent-person',
            input.stored.person.userUuid,
            input.stored.person.organizationUuid,
            resolved.agentSignIn!.clientVersion,
        ];
    }

    toDbtTarget(): DbtTargetResult {
        return {
            kind: 'none',
            reason: "Agent sign-in credentials cannot run dbt. Use the connection's key or a person's sign-in instead.",
        };
    }

    async dispose(): Promise<void> {}

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
