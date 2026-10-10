import {
    assertUnreachable,
    FeatureFlags,
    ForbiddenError,
    getErrorMessage,
    NotFoundError,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type UserWarehouseCredentialsWithSecrets,
} from '@lightdash/common';
import { type Knex } from 'knex';
import type Logger from '../../logging/logger';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { OrganizationWarehouseCredentialsModel } from '../../models/OrganizationWarehouseCredentialsModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { RefreshTokenSourceChangedError } from '../../models/RefreshTokenRotation/RefreshTokenRotation';
import type {
    AiUserWarehouseCredentials,
    UserWarehouseCredentialsModel,
} from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import type { WarehouseConnectionModel } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import type {
    CredentialOwner,
    CredentialSelection,
} from '../WarehouseClientFactory/CredentialResolver';
import {
    composePersonalWarehouseCredentials,
    projectPersonalWarehouseCredentials,
} from '../WarehouseClientFactory/personalCredentialOverlay';
import { resolvePersonalCredentialPolicy } from '../WarehouseClientFactory/personalCredentialPolicy';

export type OAuthCredentialOwner = Exclude<
    CredentialOwner,
    { kind: 'aiServiceAccount' }
>;
export type OAuthRefreshSourceCredentials =
    | CreateWarehouseCredentials
    | UserWarehouseCredentialsWithSecrets['credentials'];
type OAuthRefreshSelection<C> = Pick<
    CredentialSelection<C>,
    'connection' | 'context' | 'projectUuid' | 'refreshSource'
>;

export type OAuthCredentialRefreshSourceDependencies = {
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
    logger: Pick<typeof Logger, 'error'>;
};

type RefreshTokenExpiry = NonNullable<
    Parameters<UserWarehouseCredentialsModel['rotateRefreshToken']>[3]
>;

export type OAuthRefreshUserPolicy =
    | { kind: 'default' }
    | {
          kind: 'ai';
          userUuid: string;
          model: Pick<
              UserWarehouseCredentialsModel,
              'findAiCredentialWithSecrets'
          >;
          resolveCredential: (
              credential: AiUserWarehouseCredentials,
          ) => OAuthRefreshSourceCredentials;
      };

export class OAuthCredentialRefreshSource<
    C extends OAuthRefreshSourceCredentials & { refreshToken?: string },
> {
    constructor(
        private readonly deps: OAuthCredentialRefreshSourceDependencies,
        private readonly policy: {
            isCredential: (
                credentials: OAuthRefreshSourceCredentials,
            ) => credentials is C;
            matchesIdentity?: (
                current: C,
                selected: C,
                source: CredentialSelection<C>['refreshSource'],
            ) => boolean;
        },
        private readonly userPolicy: OAuthRefreshUserPolicy = {
            kind: 'default',
        },
    ) {}

    async isLockEnabled(
        input: OAuthRefreshSelection<C>,
        owner: OAuthCredentialOwner,
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

    async readCurrentRefreshToken(
        input: OAuthRefreshSelection<C>,
        owner: OAuthCredentialOwner,
        trx: Knex,
    ): Promise<string | null> {
        try {
            let credentials: OAuthRefreshSourceCredentials;
            let { refreshSource } = input;
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
                    if (this.userPolicy.kind === 'ai') {
                        if (owner.purpose !== UserWarehouseCredentialPurpose.AI)
                            throw new RefreshTokenSourceChangedError();
                        const current =
                            await this.userPolicy.model.findAiCredentialWithSecrets(
                                {
                                    userUuid: this.userPolicy.userUuid,
                                    warehouseType: WarehouseTypes.SNOWFLAKE,
                                },
                                trx,
                            );
                        if (!current)
                            throw new RefreshTokenSourceChangedError();
                        credentials =
                            this.userPolicy.resolveCredential(current);
                        if (current.uuid !== owner.uuid)
                            throw new RefreshTokenSourceChangedError();
                        break;
                    }
                    {
                        let personalPolicy =
                            input.refreshSource?.personalCredentialPolicy;
                        if (!personalPolicy) {
                            const { person } = input.context.actor;
                            const organizationUuid =
                                input.context.organizationUuid ??
                                (input.projectUuid
                                    ? (
                                          await this.deps.projectModel.getSummary(
                                              input.projectUuid,
                                          )
                                      ).organizationUuid
                                    : null);
                            if (!person || !organizationUuid)
                                throw new RefreshTokenSourceChangedError();
                            personalPolicy =
                                await resolvePersonalCredentialPolicy(
                                    this.deps.featureFlagModel,
                                    {
                                        organizationUuid,
                                        userUuid: person.userUuid,
                                    },
                                );
                        }
                        if (refreshSource)
                            refreshSource = {
                                ...refreshSource,
                                personalCredentialPolicy: personalPolicy,
                            };
                        const current =
                            await this.deps.userWarehouseCredentialsModel.getByUuidWithSecrets(
                                owner.uuid,
                                trx,
                                ...(personalPolicy.strictPersonalOverlay
                                    ? [personalPolicy]
                                    : []),
                            );
                        credentials = personalPolicy.strictPersonalOverlay
                            ? composePersonalWarehouseCredentials(
                                  input.refreshSource?.fallback ??
                                      (input.connection as CreateWarehouseCredentials),
                                  projectPersonalWarehouseCredentials(
                                      current.credentials,
                                  ),
                              )
                            : current.credentials;
                    }
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
                        'Unknown OAuth credential owner',
                    );
            }
            if (!this.policy.isCredential(credentials)) return null;
            if (
                this.policy.matchesIdentity &&
                !this.policy.matchesIdentity(
                    credentials,
                    input.connection,
                    refreshSource,
                )
            ) {
                throw new RefreshTokenSourceChangedError();
            }
            return credentials.refreshToken ?? null;
        } catch (error) {
            if (error instanceof NotFoundError)
                throw new RefreshTokenSourceChangedError();
            throw error;
        }
    }

    private async getConnectionProject(
        input: OAuthRefreshSelection<C>,
        trx?: Knex,
    ) {
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

    async persist(
        input: OAuthRefreshSelection<C>,
        owner: OAuthCredentialOwner,
        oldRefreshToken: string,
        newRefreshToken: string,
        trx?: Knex,
        expiry: RefreshTokenExpiry | null = null,
    ): Promise<boolean | void> {
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
                    if (this.userPolicy.kind === 'ai') {
                        if (owner.purpose !== UserWarehouseCredentialPurpose.AI)
                            throw new RefreshTokenSourceChangedError();
                        if (trx)
                            return await this.deps.userWarehouseCredentialsModel.rotateRefreshToken(
                                owner.uuid,
                                oldRefreshToken,
                                newRefreshToken,
                                expiry ?? undefined,
                                trx,
                            );
                        if (expiry)
                            return await this.deps.userWarehouseCredentialsModel.rotateRefreshToken(
                                owner.uuid,
                                oldRefreshToken,
                                newRefreshToken,
                                expiry,
                            );
                        return await this.deps.userWarehouseCredentialsModel.rotateRefreshToken(
                            owner.uuid,
                            oldRefreshToken,
                            newRefreshToken,
                        );
                    }
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
                    assertUnreachable(owner, 'Unknown OAuth credential owner');
            }
        } catch (error) {
            if (this.userPolicy.kind === 'ai') throw error;
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
}
