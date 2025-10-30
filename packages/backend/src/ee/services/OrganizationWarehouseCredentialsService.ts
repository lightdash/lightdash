import { subject } from '@casl/ability';
import {
    Account,
    CreateOrganizationWarehouseCredentials,
    CreateWarehouseCredentials,
    ForbiddenError,
    NotImplementedError,
    OpenIdIdentityIssuerType,
    OrganizationWarehouseCredentials,
    OrganizationWarehouseCredentialsSummary,
    SnowflakeAuthenticationType,
    UpdateOrganizationWarehouseCredentials,
    WarehouseTypes,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { OrganizationWarehouseCredentialsModel } from '../../models/OrganizationWarehouseCredentialsModel';
import { UserModel } from '../../models/UserModel';
import { BaseService } from '../../services/BaseService';
import { UserService } from '../../services/UserService';

type OrganizationWarehouseCredentialsServiceArguments = {
    analytics: LightdashAnalytics;
    organizationWarehouseCredentialsModel: OrganizationWarehouseCredentialsModel;
    userModel: UserModel;
};

export class OrganizationWarehouseCredentialsService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly organizationWarehouseCredentialsModel: OrganizationWarehouseCredentialsModel;

    private readonly userModel: UserModel;

    constructor({
        analytics,
        organizationWarehouseCredentialsModel,
        userModel,
    }: OrganizationWarehouseCredentialsServiceArguments) {
        super();
        this.analytics = analytics;
        this.organizationWarehouseCredentialsModel =
            organizationWarehouseCredentialsModel;
        this.userModel = userModel;
    }

    // eslint-disable-next-line class-methods-use-this
    private canManage(account: Account) {
        const { organizationUuid } = account.organization;
        if (!organizationUuid) {
            throw new ForbiddenError('User must be in an organization');
        }
        if (
            account.user.ability.cannot(
                'manage',
                subject('OrganizationWarehouseCredentials', {
                    organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage organization warehouse credentials',
            );
        }
    }

    async getAll(
        account: Account,
    ): Promise<OrganizationWarehouseCredentials[]> {
        this.canManage(account);
        const organizationUuid = account.organization.organizationUuid!;
        return this.organizationWarehouseCredentialsModel.getAllByOrganizationUuid(
            organizationUuid,
        );
    }

    /**
     * Get summaries of all organization warehouse credentials
     * This is accessible to all organization editor members (no manage permission required)
     * Returns only non-sensitive information: name, description, and warehouse type
     */
    async getAllSummaries(
        account: Account,
    ): Promise<OrganizationWarehouseCredentialsSummary[]> {
        const { organizationUuid } = account.organization;
        if (!organizationUuid) {
            throw new ForbiddenError('User must be in an organization');
        }

        if (
            account.user.ability.cannot(
                'view',
                subject('OrganizationWarehouseCredentials', {
                    organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to view organization warehouse credentials',
            );
        }

        const allCredentials =
            await this.organizationWarehouseCredentialsModel.getAllByOrganizationUuid(
                organizationUuid,
            );

        // Return only the summary fields
        return allCredentials.map((cred) => ({
            organizationWarehouseCredentialsUuid:
                cred.organizationWarehouseCredentialsUuid,
            name: cred.name,
            description: cred.description,
            warehouseType: cred.warehouseType,
        }));
    }

    async get(
        account: Account,
        credentialsUuid: string,
    ): Promise<OrganizationWarehouseCredentials> {
        this.canManage(account);
        const organizationUuid = account.organization.organizationUuid!;

        const credentials =
            await this.organizationWarehouseCredentialsModel.getByUuid(
                credentialsUuid,
            );

        // Verify it belongs to the user's organization
        if (credentials.organizationUuid !== organizationUuid) {
            throw new ForbiddenError(
                'You do not have permission to view these credentials',
            );
        }

        return credentials;
    }

    /* 
    For SSO auth (like snowflake), we need to fetch the refresh token from the user model
    and store it in the organization warehouse credentials model.
    This is used to generate new access tokens on ProjectService.refreshCredentials
    */
    private async updateCredentialTokens<
        T extends { credentials?: CreateWarehouseCredentials },
    >(userUuid: string, data: T): Promise<T> {
        if (!data.credentials) {
            return data;
        }

        if (
            userUuid &&
            data.credentials.type === WarehouseTypes.SNOWFLAKE &&
            data.credentials.authenticationType ===
                SnowflakeAuthenticationType.SSO
        ) {
            const refreshToken = await this.userModel.getRefreshToken(
                userUuid,
                OpenIdIdentityIssuerType.SNOWFLAKE,
            );
            // We save the refresh token, so we can use it to generate new access tokens on ProjectService.refreshCredentials
            return {
                ...data,
                credentials: {
                    ...data.credentials,
                    refreshToken,
                },
            };
        }
        throw new NotImplementedError('Authentication type not implemented');
    }

    async create(
        account: Account,
        data: CreateOrganizationWarehouseCredentials,
    ): Promise<OrganizationWarehouseCredentials> {
        this.canManage(account);
        const organizationUuid = account.organization.organizationUuid!;
        const userUuid = account.user.id;
        const credentialsWithTokens = await this.updateCredentialTokens(
            userUuid,
            data,
        );
        const credentials =
            await this.organizationWarehouseCredentialsModel.create(
                organizationUuid,
                credentialsWithTokens,
                userUuid,
            );

        this.analytics.track({
            event: 'organization_warehouse_credentials.created',
            userId: userUuid,
            properties: {
                organizationId: organizationUuid,
                credentialsUuid:
                    credentials.organizationWarehouseCredentialsUuid,
                warehouseType: credentials.warehouseType,
            },
        });

        return credentials;
    }

    async update(
        account: Account,
        credentialsUuid: string,
        data: UpdateOrganizationWarehouseCredentials,
    ): Promise<OrganizationWarehouseCredentials> {
        this.canManage(account);
        const organizationUuid = account.organization.organizationUuid!;
        const userUuid = account.user.id;

        // Verify ownership before update
        const existing =
            await this.organizationWarehouseCredentialsModel.getByUuidWithSensitiveData(
                credentialsUuid,
            );
        if (existing.organizationUuid !== organizationUuid) {
            throw new ForbiddenError(
                'You do not have permission to update these credentials',
            );
        }
        // Also get a new refresh token when updating credentials if applicable
        const credentialsWithTokens = await this.updateCredentialTokens(
            userUuid,
            {
                ...existing,
                ...data,
            },
        );

        const updated = await this.organizationWarehouseCredentialsModel.update(
            credentialsUuid,
            credentialsWithTokens,
        );

        this.analytics.track({
            event: 'organization_warehouse_credentials.updated',
            userId: userUuid,
            properties: {
                organizationId: organizationUuid,
                credentialsUuid,
                warehouseType: updated.warehouseType,
            },
        });

        return updated;
    }

    async delete(account: Account, credentialsUuid: string): Promise<void> {
        this.canManage(account);
        const organizationUuid = account.organization.organizationUuid!;
        const userUuid = account.user.id;

        // Verify ownership before delete
        const existing =
            await this.organizationWarehouseCredentialsModel.getByUuid(
                credentialsUuid,
            );
        if (existing.organizationUuid !== organizationUuid) {
            throw new ForbiddenError(
                'You do not have permission to delete these credentials',
            );
        }

        await this.organizationWarehouseCredentialsModel.delete(
            credentialsUuid,
        );

        this.analytics.track({
            event: 'organization_warehouse_credentials.deleted',
            userId: userUuid,
            properties: {
                organizationId: organizationUuid,
                credentialsUuid,
            },
        });
    }
}
