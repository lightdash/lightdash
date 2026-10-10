import {
    assertUnreachable,
    ForbiddenError,
    LightdashError,
    OpenIdIdentityIssuerType,
    SnowflakeAuthenticationType,
    SnowflakeTokenError,
    UnexpectedServerError,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
    type CreateSnowflakeCredentials,
} from '@lightdash/common';
import {
    OAUTH_REQUEST_TIMEOUT_MS,
    OAuthRequestTimeoutError,
} from '../../../auth/oauthRequestDeadline';
import type Logger from '../../../logging/logger';
import {
    RefreshTokenLockTimeoutError,
    RefreshTokenRowMissingError,
    type RefreshTokenRotation,
} from '../../../models/RefreshTokenRotation/RefreshTokenRotation';
import type { UserOAuthGrantsModel } from '../../../models/UserOAuthGrantsModel';
import {
    OAuthCredentialRefresher,
    OAuthRefreshExchangeError,
} from '../../OAuthRefresh/OAuthCredentialRefresher';
import {
    OAuthCredentialRefreshSource,
    type OAuthCredentialRefreshSourceDependencies,
    type OAuthRefreshSourceCredentials,
} from '../../OAuthRefresh/OAuthCredentialRefreshSource';
import { UserService } from '../../UserService';
import {
    type CredentialOwner,
    type CredentialResolution,
    type CredentialResolver,
    type CredentialSaveInput,
    type CredentialSelection,
    type ValidatedCredential,
} from '../CredentialResolver';
import { prepareWarehouseOAuthCredentials } from '../preparedOAuthCredentials';

type SnowflakeSelection = CredentialSelection<CreateSnowflakeCredentials>;

type Dependencies = OAuthCredentialRefreshSourceDependencies & {
    refreshTokenRotation: Pick<RefreshTokenRotation, 'run'>;
    userOAuthGrantsModel: Pick<UserOAuthGrantsModel, 'getRefreshToken'>;
    logger: Pick<typeof Logger, 'debug' | 'error'>;
    attributeSharedSignInExpiry: (
        projectUuid: string,
        credentials: CreateSnowflakeCredentials,
        error: unknown,
    ) => Promise<never>;
};

const cacheKeyIdentity = (
    owner: CredentialOwner | null,
): readonly (string | null)[] => [
    'snowflake-oauth',
    owner?.kind ?? null,
    owner?.uuid ?? null,
    owner?.kind === 'user' ? owner.purpose : null,
];

export class SnowflakeOAuthCredentialResolver implements CredentialResolver<CreateSnowflakeCredentials> {
    private readonly refresher: OAuthCredentialRefresher;

    private readonly source: OAuthCredentialRefreshSource<
        Extract<
            OAuthRefreshSourceCredentials,
            { type: WarehouseTypes.SNOWFLAKE }
        >
    >;

    constructor(private readonly deps: Dependencies) {
        this.refresher = new OAuthCredentialRefresher(
            deps.refreshTokenRotation,
        );
        this.source = new OAuthCredentialRefreshSource(deps, {
            isCredential: (
                credentials,
            ): credentials is Extract<
                OAuthRefreshSourceCredentials,
                { type: WarehouseTypes.SNOWFLAKE }
            > =>
                credentials.type === WarehouseTypes.SNOWFLAKE &&
                credentials.authenticationType ===
                    SnowflakeAuthenticationType.SSO,
        });
    }

    async validateOnSave(
        input: CredentialSaveInput<CreateSnowflakeCredentials>,
    ): Promise<
        ValidatedCredential<
            CreateSnowflakeCredentials,
            CreateSnowflakeCredentials
        >
    > {
        const { intent } = input;
        switch (intent.kind) {
            case 'preserve':
                return { connection: input.connection, stored: input.stored };
            case 'linkCurrentPerson': {
                const refreshToken =
                    await this.deps.userOAuthGrantsModel.getRefreshToken(
                        intent.userUuid,
                        OpenIdIdentityIssuerType.SNOWFLAKE,
                    );
                const resolved = await this.resolve({
                    ...input,
                    owner: null,
                    aiPlan: null,
                    connection: { ...input.connection, refreshToken },
                });
                const stored = { ...resolved.clientCredentials, refreshToken };
                return {
                    connection: prepareWarehouseOAuthCredentials(stored),
                    stored,
                };
            }
            case 'verifiedGoogleCallback':
                throw new UnexpectedServerError(
                    'Google credentials cannot validate a Snowflake connection',
                );
            default:
                return assertUnreachable(
                    intent,
                    'Unknown credential save intent',
                );
        }
    }

    async resolve(
        input: SnowflakeSelection,
    ): Promise<CredentialResolution<CreateSnowflakeCredentials>> {
        return this.refresh(input, {
            errorPolicy: 'standard',
            legacyOwner: input.owner,
        });
    }

    async refresh(
        input: SnowflakeSelection,
        policy: {
            errorPolicy: 'standard' | 'raw';
            legacyOwner: CredentialOwner | null;
        },
    ): Promise<CredentialResolution<CreateSnowflakeCredentials>> {
        const { owner } = input;
        if (owner?.kind === 'aiServiceAccount') {
            throw new ForbiddenError(
                'Snowflake OAuth does not support AI service account credentials',
            );
        }
        if (input.aiPlan?.identity === 'connected_person') {
            if (
                owner?.kind !== 'user' ||
                owner.purpose !== UserWarehouseCredentialPurpose.AI ||
                !input.connection.token
            ) {
                throw new ForbiddenError(
                    'Snowflake agent credentials must be minted before use',
                );
            }
            return {
                clientCredentials: input.connection,
                clientOptions: {},
                agentSignIn: null,
                cacheable: true,
            };
        }
        if (
            owner?.kind === 'user' &&
            owner.purpose !== UserWarehouseCredentialPurpose.DEFAULT
        ) {
            throw new ForbiddenError(
                'Snowflake agent credentials must be minted before use',
            );
        }
        try {
            if (!input.connection.refreshToken) {
                throw new Error(
                    'No refresh token available for Snowflake SSO authentication',
                );
            }
            const lockEnabled =
                owner !== null &&
                (await this.source.isLockEnabled(input, owner));
            const persistOwner = lockEnabled ? owner : policy.legacyOwner;
            if (persistOwner?.kind === 'aiServiceAccount') {
                throw new ForbiddenError(
                    'Snowflake OAuth does not support AI service account credentials',
                );
            }
            const result = await this.refresher.refresh({
                refreshToken: input.connection.refreshToken,
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
                              shareKey: 'snowflake-personal',
                              readCurrentRefreshToken: (trx) =>
                                  this.source.readCurrentRefreshToken(
                                      input,
                                      trx,
                                  ),
                          }
                        : null,
                exchange: (refreshToken) => {
                    this.deps.logger.debug(
                        `Refreshing snowflake token for user ${input.context.actor.person?.userUuid ?? 'unknown'}`,
                    );
                    return UserService.generateSnowflakeAccessToken(
                        refreshToken,
                        ...(lockEnabled ? [OAUTH_REQUEST_TIMEOUT_MS] : []),
                    );
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
                    ...input.connection,
                    token: result.accessToken,
                    refreshToken: result.refreshToken,
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
            if (error instanceof OAuthRequestTimeoutError) {
                throw new RefreshTokenLockTimeoutError();
            }
            if (policy.errorPolicy === 'raw') throw error;
            const mapped = this.mapError(error);
            if (owner?.kind === 'project') {
                return this.deps.attributeSharedSignInExpiry(
                    owner.uuid,
                    caught instanceof OAuthRefreshExchangeError
                        ? {
                              ...input.connection,
                              refreshToken: caught.refreshToken,
                          }
                        : input.connection,
                    mapped,
                );
            }
            throw mapped;
        }
    }

    private mapError(error: unknown): LightdashError {
        if (error instanceof LightdashError) return error;
        const refreshError =
            error instanceof RefreshTokenRowMissingError
                ? new Error(
                      'No refresh token available for Snowflake SSO authentication',
                  )
                : error;
        this.deps.logger.error(
            `Error refreshing snowflake token: ${JSON.stringify(refreshError)}`,
        );
        let message = 'Error refreshing snowflake token';
        try {
            const details = JSON.parse(
                (refreshError as { data: string }).data,
            ).message;
            message = `Error refreshing snowflake token: ${details}`;
        } catch {
            message = 'Error refreshing snowflake token';
        }
        return new SnowflakeTokenError(message);
    }

    cacheKeyIdentity(input: SnowflakeSelection): readonly (string | null)[] {
        return cacheKeyIdentity(input.owner);
    }

    async dispose(): Promise<void> {}
}
