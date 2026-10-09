import {
    assertUnreachable,
    FeatureFlags,
    ForbiddenError,
    getErrorMessage,
    LightdashError,
    NotFoundError,
    OpenIdIdentityIssuerType,
    SnowflakeAuthenticationType,
    SnowflakeTokenError,
    UnexpectedServerError,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
    type CreateSnowflakeCredentials,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { type Knex } from 'knex';
import {
    OAUTH_REQUEST_TIMEOUT_MS,
    OAuthRequestTimeoutError,
} from '../../../auth/oauthRequestDeadline';
import type Logger from '../../../logging/logger';
import type { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import type { OrganizationWarehouseCredentialsModel } from '../../../models/OrganizationWarehouseCredentialsModel';
import type { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import {
    RefreshTokenLockTimeoutError,
    RefreshTokenRowMissingError,
    RefreshTokenSourceChangedError,
    type RefreshTokenRotation,
} from '../../../models/RefreshTokenRotation/RefreshTokenRotation';
import type { UserOAuthGrantsModel } from '../../../models/UserOAuthGrantsModel';
import type { UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import type { WarehouseConnectionModel } from '../../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { SnowflakeOAuthRefresher } from '../../OAuthRefresh/SnowflakeOAuthRefresher';
import { UserService } from '../../UserService';
import {
    preparedCredentials,
    type CredentialOwner,
    type CredentialResolution,
    type CredentialResolver,
    type CredentialSaveInput,
    type CredentialSelection,
    type MaterializedCredentials,
    type ValidatedCredential,
} from '../CredentialResolver';

type SnowflakeSelection = CredentialSelection<CreateSnowflakeCredentials>;
type PersonalOwner = Exclude<CredentialOwner, { kind: 'aiServiceAccount' }>;

type Dependencies = {
    refreshTokenRotation: Pick<RefreshTokenRotation, 'run'>;
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
    projectModel: Pick<
        ProjectModel,
        | 'getSummary'
        | 'getOwnWarehouseCredentialsForProject'
        | 'rotateRefreshToken'
    >;
    organizationWarehouseCredentialsModel: Pick<
        OrganizationWarehouseCredentialsModel,
        'getByUuidWithSensitiveData' | 'rotateRefreshToken'
    >;
    userWarehouseCredentialsModel: Pick<
        UserWarehouseCredentialsModel,
        'getByUuidWithSecrets' | 'rotateRefreshToken'
    >;
    warehouseConnectionModel: Pick<
        WarehouseConnectionModel,
        'getProject' | 'getOwnCredentials' | 'rotateRefreshToken'
    >;
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

export const prepareSnowflakeOAuthCredentials = <
    T extends CreateWarehouseCredentials,
>(
    connection: T,
): T =>
    connection.type === WarehouseTypes.SNOWFLAKE &&
    connection.authenticationType === SnowflakeAuthenticationType.SSO
        ? { ...connection, [preparedCredentials]: true }
        : connection;

export class SnowflakeOAuthCredentialResolver implements CredentialResolver<CreateSnowflakeCredentials> {
    private readonly refresher: SnowflakeOAuthRefresher;

    constructor(private readonly deps: Dependencies) {
        this.refresher = new SnowflakeOAuthRefresher(deps.refreshTokenRotation);
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
                    connection: prepareSnowflakeOAuthCredentials(stored),
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
                owner !== null && (await this.isLockEnabled(input, owner));
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
                                  this.readCurrentRefreshToken(
                                      input,
                                      owner,
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
                        await this.persist(
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
                cacheable: true,
            };
        } catch (error) {
            if (error instanceof OAuthRequestTimeoutError) {
                throw new RefreshTokenLockTimeoutError();
            }
            if (policy.errorPolicy === 'raw') throw error;
            const mapped = this.mapError(error);
            if (owner?.kind === 'project') {
                return this.deps.attributeSharedSignInExpiry(
                    owner.uuid,
                    input.connection,
                    mapped,
                );
            }
            throw mapped;
        }
    }

    private async isLockEnabled(
        input: SnowflakeSelection,
        owner: PersonalOwner,
    ): Promise<boolean> {
        let { organizationUuid } = input.context;
        if (organizationUuid === null) {
            if (owner.kind === 'organization') {
                organizationUuid = (
                    await this.deps.organizationWarehouseCredentialsModel.getByUuidWithSensitiveData(
                        owner.uuid,
                    )
                ).organizationUuid;
            } else if (owner.kind === 'project' || input.projectUuid !== null) {
                organizationUuid = (
                    await this.deps.projectModel.getSummary(
                        owner.kind === 'project'
                            ? owner.uuid
                            : (input.projectUuid as string),
                    )
                ).organizationUuid;
            }
        }
        const { enabled } = await this.deps.featureFlagModel.get(
            organizationUuid === null
                ? { featureFlagId: FeatureFlags.WarehouseOAuthRefreshLock }
                : {
                      user: { organizationUuid },
                      featureFlagId: FeatureFlags.WarehouseOAuthRefreshLock,
                  },
        );
        return enabled;
    }

    private async readCurrentRefreshToken(
        input: SnowflakeSelection,
        owner: PersonalOwner,
        trx: Knex,
    ): Promise<string | null> {
        try {
            let credentials: Pick<CreateWarehouseCredentials, 'type'> & {
                authenticationType?: string;
                refreshToken?: string;
            };
            switch (owner.kind) {
                case 'project':
                    credentials =
                        await this.deps.projectModel.getOwnWarehouseCredentialsForProject(
                            owner.uuid,
                            trx,
                        );
                    break;
                case 'organization':
                    credentials = (
                        await this.deps.organizationWarehouseCredentialsModel.getByUuidWithSensitiveData(
                            owner.uuid,
                            trx,
                        )
                    ).credentials;
                    break;
                case 'user':
                    credentials = (
                        await this.deps.userWarehouseCredentialsModel.getByUuidWithSecrets(
                            owner.uuid,
                            trx,
                        )
                    ).credentials;
                    break;
                case 'warehouseConnection': {
                    const project = await this.getConnectionProject(input, trx);
                    credentials =
                        await this.deps.warehouseConnectionModel.getOwnCredentials(
                            project,
                            owner.uuid,
                            trx,
                        );
                    break;
                }
                default:
                    return assertUnreachable(
                        owner,
                        'Unknown Snowflake credential owner',
                    );
            }
            return credentials.type === WarehouseTypes.SNOWFLAKE &&
                credentials.authenticationType ===
                    SnowflakeAuthenticationType.SSO
                ? (credentials.refreshToken ?? null)
                : null;
        } catch (error) {
            if (error instanceof NotFoundError)
                throw new RefreshTokenSourceChangedError();
            throw error;
        }
    }

    private async getConnectionProject(input: SnowflakeSelection, trx?: Knex) {
        if (input.projectUuid === null)
            throw new ForbiddenError(
                'Warehouse connection credentials require a project',
            );
        const project = await this.deps.warehouseConnectionModel.getProject(
            input.projectUuid,
            trx,
        );
        if (
            input.context.organizationUuid !== null &&
            project.organizationUuid !== input.context.organizationUuid
        ) {
            throw new ForbiddenError(
                'Warehouse connection credentials belong to another organization',
            );
        }
        return project;
    }

    private async persist(
        input: SnowflakeSelection,
        owner: PersonalOwner,
        oldRefreshToken: string,
        newRefreshToken: string,
        trx?: Knex,
    ): Promise<void> {
        try {
            switch (owner.kind) {
                case 'project':
                    await this.deps.projectModel.rotateRefreshToken(
                        owner.uuid,
                        oldRefreshToken,
                        newRefreshToken,
                        ...(trx ? [trx] : []),
                    );
                    break;
                case 'organization':
                    await this.deps.organizationWarehouseCredentialsModel.rotateRefreshToken(
                        owner.uuid,
                        oldRefreshToken,
                        newRefreshToken,
                        ...(trx ? [trx] : []),
                    );
                    break;
                case 'user':
                    if (trx) {
                        await this.deps.userWarehouseCredentialsModel.rotateRefreshToken(
                            owner.uuid,
                            oldRefreshToken,
                            newRefreshToken,
                            undefined,
                            trx,
                        );
                    } else {
                        await this.deps.userWarehouseCredentialsModel.rotateRefreshToken(
                            owner.uuid,
                            oldRefreshToken,
                            newRefreshToken,
                        );
                    }
                    break;
                case 'warehouseConnection':
                    await this.deps.warehouseConnectionModel.rotateRefreshToken(
                        await this.getConnectionProject(input, trx),
                        owner.uuid,
                        oldRefreshToken,
                        newRefreshToken,
                        ...(trx ? [trx] : []),
                    );
                    break;
                default:
                    assertUnreachable(
                        owner,
                        'Unknown Snowflake credential owner',
                    );
            }
        } catch (error) {
            this.deps.logger.error(
                'Failed to persist rotated OAuth refresh token',
                {
                    sourceKind: owner.kind,
                    sourceUuid: owner.uuid,
                    error: getErrorMessage(error),
                },
            );
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
