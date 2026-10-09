import {
    assertUnreachable,
    FeatureFlags,
    ForbiddenError,
    getErrorMessage,
    NotFoundError,
    type CreateWarehouseCredentials,
    type UserWarehouseCredentialsWithSecrets,
} from '@lightdash/common';
import { type Knex } from 'knex';
import type Logger from '../../logging/logger';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { OrganizationWarehouseCredentialsModel } from '../../models/OrganizationWarehouseCredentialsModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { RefreshTokenSourceChangedError } from '../../models/RefreshTokenRotation/RefreshTokenRotation';
import type { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import type { WarehouseConnectionModel } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import type {
    CredentialOwner,
    CredentialSelection,
} from '../WarehouseClientFactory/CredentialResolver';

export type OAuthCredentialOwner = Exclude<
    CredentialOwner,
    { kind: 'aiServiceAccount' }
>;
export type OAuthRefreshSourceCredentials =
    | CreateWarehouseCredentials
    | UserWarehouseCredentialsWithSecrets['credentials'];
type OAuthRefreshSelection<C> = Pick<
    CredentialSelection<C>,
    'connection' | 'context' | 'projectUuid'
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

export class OAuthCredentialRefreshSource<
    C extends OAuthRefreshSourceCredentials & { refreshToken?: string },
> {
    constructor(
        private readonly deps: OAuthCredentialRefreshSourceDependencies,
        private readonly policy: {
            isCredential: (
                credentials: OAuthRefreshSourceCredentials,
            ) => credentials is C;
            matchesIdentity?: (current: C, selected: C) => boolean;
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
                        'Unknown OAuth credential owner',
                    );
            }
            if (!this.policy.isCredential(credentials)) return null;
            if (
                this.policy.matchesIdentity &&
                !this.policy.matchesIdentity(credentials, input.connection)
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
                    assertUnreachable(owner, 'Unknown OAuth credential owner');
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
}
