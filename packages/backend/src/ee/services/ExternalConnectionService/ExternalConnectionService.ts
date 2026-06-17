import { subject } from '@casl/ability';
import {
    ForbiddenError,
    NotFoundError,
    NotImplementedError,
    type CreateExternalConnection,
    type ExternalConnection,
    type RegisteredAccount,
    type UpdateExternalConnection,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { BaseService } from '../../../services/BaseService';
import type { SpacePermissionService } from '../../../services/SpaceService/SpacePermissionService';
import { type ExternalConnectionModel } from '../../models/ExternalConnectionModel';

type ExternalConnectionServiceArguments = {
    analytics: LightdashAnalytics;
    externalConnectionModel: ExternalConnectionModel;
    spacePermissionService: SpacePermissionService;
};

export class ExternalConnectionService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly externalConnectionModel: ExternalConnectionModel;

    private readonly spacePermissionService: SpacePermissionService;

    constructor(args: ExternalConnectionServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.externalConnectionModel = args.externalConnectionModel;
        this.spacePermissionService = args.spacePermissionService;
    }

    private assertCanManage(
        account: RegisteredAccount,
        projectUuid: string,
        organizationUuid: string,
    ): void {
        const ability = this.createAuditedAbility(account);
        if (
            ability.cannot(
                'manage',
                subject('ExternalConnection', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage external connections',
            );
        }
    }

    /**
     * Loads the app row and asserts the caller can `manage` the DataApp,
     * mirroring AppGenerateService's assertCanManageApp pattern (space
     * context + createdByUserUuid). Returns the app row for downstream use.
     */
    private async assertCanManageApp(
        account: RegisteredAccount,
        appUuid: string,
    ): Promise<{
        app_id: string;
        project_uuid: string;
        space_uuid: string | null;
        created_by_user_uuid: string;
        organization_uuid: string;
    }> {
        const app = await this.externalConnectionModel.findApp(appUuid);
        if (!app) {
            throw new NotFoundError('Data app not found');
        }

        const spaceContext = app.space_uuid
            ? await this.spacePermissionService.getSpaceAccessContext(
                  account.user.id,
                  app.space_uuid,
              )
            : {};

        const ability = this.createAuditedAbility(account);
        if (
            ability.cannot(
                'manage',
                subject('DataApp', {
                    organizationUuid: app.organization_uuid,
                    projectUuid: app.project_uuid,
                    createdByUserUuid: app.created_by_user_uuid,
                    ...spaceContext,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage this data app',
            );
        }
        return app;
    }

    async create(
        account: RegisteredAccount,
        projectUuid: string,
        organizationUuid: string,
        data: CreateExternalConnection,
    ): Promise<ExternalConnection> {
        this.assertCanManage(account, projectUuid, organizationUuid);
        const connection = await this.externalConnectionModel.create(
            projectUuid,
            organizationUuid,
            account.user.id,
            data,
        );
        this.analytics.track({
            event: 'external_connection.created',
            userId: account.user.id,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                externalConnectionUuid: connection.externalConnectionUuid,
                authType: connection.type,
            },
        });
        return connection;
    }

    async list(
        account: RegisteredAccount,
        projectUuid: string,
    ): Promise<ExternalConnection[]> {
        const { organizationUuid } = account.organization;
        if (!organizationUuid) {
            throw new ForbiddenError('User must be in an organization');
        }
        this.assertCanManage(account, projectUuid, organizationUuid);
        return this.externalConnectionModel.list(projectUuid);
    }

    private async getOwnedConnection(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
    ): Promise<ExternalConnection> {
        const connection =
            await this.externalConnectionModel.findByUuid(connectionUuid);
        if (!connection || connection.projectUuid !== projectUuid) {
            throw new NotFoundError('External connection not found');
        }
        this.assertCanManage(
            account,
            connection.projectUuid,
            connection.organizationUuid,
        );
        return connection;
    }

    async get(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
    ): Promise<ExternalConnection> {
        return this.getOwnedConnection(account, projectUuid, connectionUuid);
    }

    async update(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
        data: UpdateExternalConnection,
    ): Promise<ExternalConnection> {
        const existing = await this.getOwnedConnection(
            account,
            projectUuid,
            connectionUuid,
        );
        const updated = await this.externalConnectionModel.update(
            connectionUuid,
            account.user.id,
            data,
        );
        this.analytics.track({
            event: 'external_connection.updated',
            userId: account.user.id,
            properties: {
                organizationId: existing.organizationUuid,
                projectId: projectUuid,
                externalConnectionUuid: connectionUuid,
            },
        });
        return updated;
    }

    async delete(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
    ): Promise<void> {
        const existing = await this.getOwnedConnection(
            account,
            projectUuid,
            connectionUuid,
        );
        await this.externalConnectionModel.softDelete(connectionUuid);
        this.analytics.track({
            event: 'external_connection.deleted',
            userId: account.user.id,
            properties: {
                organizationId: existing.organizationUuid,
                projectId: projectUuid,
                externalConnectionUuid: connectionUuid,
            },
        });
    }

    async rotateSecret(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
        secret: string,
    ): Promise<ExternalConnection> {
        const existing = await this.getOwnedConnection(
            account,
            projectUuid,
            connectionUuid,
        );
        await this.externalConnectionModel.rotateSecret(connectionUuid, secret);
        this.analytics.track({
            event: 'external_connection.secret_rotated',
            userId: account.user.id,
            properties: {
                organizationId: existing.organizationUuid,
                projectId: projectUuid,
                externalConnectionUuid: connectionUuid,
            },
        });
        return this.getOwnedConnection(account, projectUuid, connectionUuid);
    }

    async listAppLinks(
        account: RegisteredAccount,
        projectUuid: string,
        appUuid: string,
    ): Promise<Array<{ alias: string; connection: ExternalConnection }>> {
        const app = await this.assertCanManageApp(account, appUuid);
        if (app.project_uuid !== projectUuid) {
            throw new NotFoundError('Data app not found');
        }
        return this.externalConnectionModel.listAppLinks(app.app_id);
    }

    async linkToApp(
        account: RegisteredAccount,
        projectUuid: string,
        appUuid: string,
        externalConnectionUuid: string,
        alias: string,
    ): Promise<void> {
        const app = await this.assertCanManageApp(account, appUuid);
        if (app.project_uuid !== projectUuid) {
            throw new NotFoundError('Data app not found');
        }
        const connection = await this.getOwnedConnection(
            account,
            projectUuid,
            externalConnectionUuid,
        );
        await this.externalConnectionModel.linkToApp(
            app.app_id,
            externalConnectionUuid,
            alias,
        );
        this.analytics.track({
            event: 'external_connection.linked',
            userId: account.user.id,
            properties: {
                organizationId: connection.organizationUuid,
                projectId: projectUuid,
                externalConnectionUuid,
                appUuid,
                alias,
            },
        });
    }

    async unlinkFromApp(
        account: RegisteredAccount,
        projectUuid: string,
        appUuid: string,
        alias: string,
    ): Promise<void> {
        const app = await this.assertCanManageApp(account, appUuid);
        if (app.project_uuid !== projectUuid) {
            throw new NotFoundError('Data app not found');
        }
        const links = await this.externalConnectionModel.listAppLinks(
            app.app_id,
        );
        const link = links.find((l) => l.alias === alias);
        if (!link) {
            throw new NotFoundError('App external connection link not found');
        }
        await this.externalConnectionModel.unlinkFromApp(app.app_id, alias);
        this.analytics.track({
            event: 'external_connection.unlinked',
            userId: account.user.id,
            properties: {
                organizationId: link.connection.organizationUuid,
                projectId: projectUuid,
                externalConnectionUuid: link.connection.externalConnectionUuid,
                appUuid,
                alias,
            },
        });
    }

    /**
     * EXTENSION POINT (M2): the data-app outbound proxy. Validates the
     * request against the connection's allow-lists, applies the rate
     * limiter (`externalConnectionModel.incrementRateCounter`), injects the
     * decrypted secret (`getDecryptedSecret`), and performs the fetch.
     * Intentionally unimplemented in M1.
     */
    // eslint-disable-next-line class-methods-use-this
    async proxyFetch(): Promise<never> {
        throw new NotImplementedError(
            'proxyFetch is implemented in milestone M2',
        );
    }

    /**
     * EXTENSION POINT (M5): a "test connection" dry-run that exercises
     * proxyFetch against the connection's origin without persisting.
     * Intentionally unimplemented in M1.
     */
    // eslint-disable-next-line class-methods-use-this
    async testConnection(): Promise<never> {
        throw new NotImplementedError(
            'testConnection is implemented in milestone M5',
        );
    }
}
