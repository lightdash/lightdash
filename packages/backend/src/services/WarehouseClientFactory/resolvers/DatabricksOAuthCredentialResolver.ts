import {
    assertUnreachable,
    DatabricksAuthenticationType,
    DatabricksTokenError,
    ForbiddenError,
    getErrorMessage,
    LightdashError,
    NotFoundError,
    UnexpectedServerError,
    WarehouseTypes,
    type CreateDatabricksCredentials,
} from '@lightdash/common';
import {
    DATABRICKS_DEFAULT_OAUTH_CLIENT_ID,
    exchangeDatabricksOAuthCredentials,
    refreshDatabricksOAuthToken,
} from '@lightdash/warehouses';
import { refreshDatabricksOAuthTokenWithDeadline } from '../../../auth/databricksOAuthRefresh';
import { OAuthRequestTimeoutError } from '../../../auth/oauthRequestDeadline';
import type { LightdashConfig } from '../../../config/parseConfig';
import { normalizeDatabricksHostLenient } from '../../../controllers/authentication/strategies/databricksStrategy';
import { toDbtTarget } from '../../../dbt/targets';
import {
    RefreshTokenLockTimeoutError,
    RefreshTokenRowMissingError,
    RefreshTokenSourceChangedError,
    type RefreshTokenRotation,
} from '../../../models/RefreshTokenRotation/RefreshTokenRotation';
import type { UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import {
    OAuthCredentialRefresher,
    OAuthRefreshExchangeError,
} from '../../OAuthRefresh/OAuthCredentialRefresher';
import {
    OAuthCredentialRefreshSource,
    type OAuthCredentialRefreshSourceDependencies,
    type OAuthRefreshSourceCredentials,
} from '../../OAuthRefresh/OAuthCredentialRefreshSource';
import {
    type CredentialOwner,
    type CredentialResolution,
    type CredentialResolver,
    type CredentialSaveInput,
    type CredentialSelection,
    type DbtTargetPolicy,
    type DbtTargetResult,
    type ValidatedCredential,
} from '../CredentialResolver';
import { resolvePersonalCredentialPolicy } from '../personalCredentialPolicy';
import { prepareWarehouseOAuthCredentials } from '../preparedOAuthCredentials';

type DatabricksSelection = CredentialSelection<CreateDatabricksCredentials>;
type DatabricksSource = Extract<
    OAuthRefreshSourceCredentials,
    { type: WarehouseTypes.DATABRICKS }
>;
type Dependencies = OAuthCredentialRefreshSourceDependencies & {
    lightdashConfig: LightdashConfig;
    refreshTokenRotation: Pick<RefreshTokenRotation, 'run'>;
    userWarehouseCredentialsModel: OAuthCredentialRefreshSourceDependencies['userWarehouseCredentialsModel'] &
        Pick<
            UserWarehouseCredentialsModel,
            'findDatabricksOauthU2mForHostWithSecrets'
        >;
    attributeSharedSignInExpiry: (
        projectUuid: string,
        credentials: CreateDatabricksCredentials,
        error: unknown,
    ) => Promise<never>;
};

export class DatabricksOAuthCredentialResolver implements CredentialResolver<CreateDatabricksCredentials> {
    private readonly refresher: OAuthCredentialRefresher;

    private readonly source: OAuthCredentialRefreshSource<DatabricksSource>;

    constructor(private readonly deps: Dependencies) {
        this.refresher = new OAuthCredentialRefresher(
            deps.refreshTokenRotation,
        );
        this.source = new OAuthCredentialRefreshSource(deps, {
            isCredential: (credentials): credentials is DatabricksSource => {
                if (credentials.type !== WarehouseTypes.DATABRICKS) {
                    throw new RefreshTokenSourceChangedError();
                }
                return true;
            },
            matchesIdentity: (current, selected, source) => {
                if (source?.personalCredentialPolicy?.strictPersonalOverlay) {
                    const selectedIdentity = this.providerIdentity(selected);
                    return this.providerIdentity(current).every(
                        (value, index) => value === selectedIdentity[index],
                    );
                }
                const selectedCredentials = source?.credentials ?? selected;
                const fallback = source?.fallback;
                if (
                    selectedCredentials.type !== WarehouseTypes.DATABRICKS ||
                    (fallback && fallback.type !== WarehouseTypes.DATABRICKS)
                )
                    return false;
                const selectedIdentity = this.providerIdentity(
                    selectedCredentials,
                    fallback,
                );
                return this.providerIdentity(current, fallback).every(
                    (value, index) => value === selectedIdentity[index],
                );
            },
        });
    }

    private selectClient(
        credentials: Pick<
            CreateDatabricksCredentials,
            'authenticationType' | 'oauthClientId' | 'oauthClientSecret'
        >,
    ) {
        const configured = this.deps.lightdashConfig.auth.databricks;
        const clientId =
            credentials.oauthClientId ||
            configured.clientId ||
            DATABRICKS_DEFAULT_OAUTH_CLIENT_ID;
        let clientSecret: string | undefined;
        if (
            credentials.authenticationType ===
            DatabricksAuthenticationType.OAUTH_U2M
        ) {
            if (clientId === configured.clientId)
                clientSecret = configured.clientSecret;
        } else if (credentials.oauthClientId) {
            clientSecret = credentials.oauthClientSecret;
        } else if (configured.clientId) {
            clientSecret = configured.clientSecret;
        }
        return { clientId, clientSecret };
    }

    private providerIdentity(
        credentials: DatabricksSource,
        fallback?: DatabricksSource,
    ): readonly (string | null)[] {
        return [
            'databricks-oauth',
            credentials.authenticationType ?? null,
            normalizeDatabricksHostLenient(
                credentials.serverHostName || fallback?.serverHostName,
            ),
            this.selectClient({
                ...credentials,
                oauthClientId:
                    credentials.oauthClientId || fallback?.oauthClientId,
            }).clientId,
        ];
    }

    async validateOnSave(
        input: CredentialSaveInput<CreateDatabricksCredentials>,
    ): Promise<ValidatedCredential<CreateDatabricksCredentials>> {
        if (input.owner?.kind === 'aiServiceAccount') {
            throw new ForbiddenError(
                'Databricks OAuth does not support shared agent account credentials',
            );
        }
        let userUuid: string | undefined;
        switch (input.intent.kind) {
            case 'preserve':
                userUuid = input.context.actor.person?.userUuid;
                break;
            case 'linkCurrentPerson':
                userUuid = input.intent.userUuid;
                break;
            case 'verifiedGoogleCallback':
                throw new UnexpectedServerError(
                    'Google credentials cannot validate a Databricks connection',
                );
            default:
                return assertUnreachable(
                    input.intent,
                    'Unknown credential save intent',
                );
        }
        let { refreshToken } = input.connection;
        const isU2m =
            input.connection.authenticationType ===
            DatabricksAuthenticationType.OAUTH_U2M;
        if (isU2m && !refreshToken) {
            const matching = userUuid
                ? await this.deps.userWarehouseCredentialsModel.findDatabricksOauthU2mForHostWithSecrets(
                      userUuid,
                      input.connection.serverHostName,
                      await resolvePersonalCredentialPolicy(
                          this.deps.featureFlagModel,
                          {
                              organizationUuid: input.context.organizationUuid,
                              userUuid,
                          },
                      ),
                  )
                : undefined;
            if (
                matching?.credentials.type === WarehouseTypes.DATABRICKS &&
                matching.credentials.authenticationType ===
                    DatabricksAuthenticationType.OAUTH_U2M
            ) {
                refreshToken = matching.credentials.refreshToken;
            }
            if (!refreshToken) {
                throw new NotFoundError(
                    `No Databricks OAuth credentials found for workspace ${input.connection.serverHostName}. Please sign in with Databricks for this workspace and try again.`,
                );
            }
        }
        const resolved = await this.resolve({
            ...input,
            owner: null,
            connection: { ...input.connection, refreshToken },
        });
        const stored = {
            ...resolved.clientCredentials,
            ...(isU2m ? { refreshToken } : {}),
        };
        return { connection: prepareWarehouseOAuthCredentials(stored), stored };
    }

    async resolve(
        input: DatabricksSelection,
    ): Promise<CredentialResolution<CreateDatabricksCredentials>> {
        return this.refresh(input, {
            errorPolicy: 'standard',
            legacyOwner: input.owner,
            refreshTokenFallback: 'retain',
        });
    }

    async refresh(
        input: DatabricksSelection,
        policy: {
            errorPolicy: 'standard' | 'raw';
            legacyOwner: CredentialOwner | null;
            refreshTokenFallback: 'retain' | 'response';
        },
    ): Promise<CredentialResolution<CreateDatabricksCredentials>> {
        const { owner, connection } = input;
        if (
            owner?.kind === 'aiServiceAccount' ||
            policy.legacyOwner?.kind === 'aiServiceAccount'
        ) {
            throw new ForbiddenError(
                'Databricks OAuth does not support shared agent account credentials',
            );
        }
        const isU2m =
            connection.authenticationType ===
            DatabricksAuthenticationType.OAUTH_U2M;
        try {
            const { clientId, clientSecret } = this.selectClient(connection);
            if (
                !isU2m &&
                connection.oauthClientId &&
                connection.oauthClientSecret &&
                !connection.refreshToken
            ) {
                const result = await exchangeDatabricksOAuthCredentials(
                    connection.serverHostName,
                    connection.oauthClientId,
                    connection.oauthClientSecret,
                );
                return {
                    clientCredentials: {
                        ...connection,
                        token: result.accessToken,
                        refreshToken: result.refreshToken,
                    },
                    clientOptions: {},
                    agentSignIn: null,
                    cacheable: true,
                };
            }
            if (!connection.refreshToken) {
                throw new Error(
                    isU2m
                        ? 'No refresh token available for Databricks U2M OAuth authentication'
                        : 'No refresh token or OAuth credentials available for Databricks OAuth authentication',
                );
            }
            const lockEnabled =
                owner !== null &&
                (await this.source.isLockEnabled(input, owner));
            const persistOwner = lockEnabled ? owner : policy.legacyOwner;
            const result = await this.refresher.refresh({
                refreshToken: connection.refreshToken,
                row:
                    lockEnabled && owner !== null
                        ? {
                              key: {
                                  kind: owner.kind,
                                  uuid: owner.uuid,
                                  purpose:
                                      owner.kind === 'user'
                                          ? owner.purpose
                                          : null,
                              },
                              shareKey: JSON.stringify(
                                  this.providerIdentity(connection),
                              ),
                              readCurrentRefreshToken: (trx) =>
                                  this.source.readCurrentRefreshToken(
                                      input,
                                      trx,
                                  ),
                          }
                        : null,
                exchange: async (refreshToken) => {
                    const refreshed = await (
                        lockEnabled
                            ? refreshDatabricksOAuthTokenWithDeadline
                            : refreshDatabricksOAuthToken
                    )(
                        connection.serverHostName,
                        clientId,
                        refreshToken,
                        clientSecret,
                    );
                    return {
                        ...refreshed,
                        previousRefreshToken: refreshToken,
                    };
                },
                persist: async ({
                    lockedRefreshToken,
                    result: refreshed,
                    trx,
                }) => {
                    if (
                        persistOwner !== null &&
                        refreshed.refreshToken &&
                        refreshed.refreshToken !== lockedRefreshToken
                    ) {
                        await this.source.persist(
                            input,
                            persistOwner,
                            lockedRefreshToken,
                            refreshed.refreshToken,
                            trx,
                        );
                    }
                },
            });
            return {
                clientCredentials: {
                    ...connection,
                    token: result.accessToken,
                    refreshToken:
                        !isU2m && policy.refreshTokenFallback === 'retain'
                            ? result.refreshToken || result.previousRefreshToken
                            : result.refreshToken,
                },
                clientOptions: {},
                agentSignIn: null,
                cacheable: true,
            };
        } catch (caught) {
            const error =
                caught instanceof OAuthRefreshExchangeError
                    ? caught.originalError
                    : caught;
            if (error instanceof OAuthRequestTimeoutError)
                throw new RefreshTokenLockTimeoutError();
            if (policy.errorPolicy === 'raw') throw error;
            const mapped = this.mapError(error, isU2m);
            if (owner?.kind === 'project') {
                return this.deps.attributeSharedSignInExpiry(
                    owner.uuid,
                    caught instanceof OAuthRefreshExchangeError
                        ? { ...connection, refreshToken: caught.refreshToken }
                        : connection,
                    mapped,
                );
            }
            throw mapped;
        }
    }

    private mapError(error: unknown, isU2m: boolean): LightdashError {
        if (error instanceof LightdashError) return error;
        const refreshError =
            error instanceof RefreshTokenRowMissingError
                ? new Error(
                      isU2m
                          ? 'No refresh token available for Databricks U2M OAuth authentication'
                          : 'No refresh token or OAuth credentials available for Databricks OAuth authentication',
                  )
                : error;
        const message = `Error refreshing databricks${isU2m ? ' U2M OAuth' : ''} token: ${getErrorMessage(refreshError)}`;
        this.deps.logger.error(message);
        return isU2m
            ? new DatabricksTokenError(message)
            : new UnexpectedServerError('Error refreshing databricks token');
    }

    cacheKeyIdentity(input: DatabricksSelection): readonly (string | null)[] {
        return [
            ...this.providerIdentity(input.connection),
            input.owner?.kind ?? null,
            input.owner?.uuid ?? null,
            input.owner?.kind === 'user' ? input.owner.purpose : null,
        ];
    }

    toDbtTarget(
        _resolved: CredentialResolution<CreateDatabricksCredentials>,
        finalConnection: CreateDatabricksCredentials,
        policy: DbtTargetPolicy,
    ): DbtTargetResult {
        return toDbtTarget(finalConnection, policy);
    }

    async dispose(): Promise<void> {}
}
