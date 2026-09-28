import { subject } from '@casl/ability';
import {
    assertRegisteredAccount,
    ForbiddenError,
    ParameterError,
    type Account,
    type DbtSourceBindings,
    type WarehouseTypes,
} from '@lightdash/common';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type WarehouseConnectionCompileModel } from '../../models/WarehouseConnectionCompileModel/WarehouseConnectionCompileModel';
import { type WarehouseConnectionModel } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { BaseService } from '../BaseService';
import { type WarehouseCredentialPolicy } from '../WarehouseConnectionService/WarehouseConnectionService';

type WarehouseConnectionBindingServiceArguments = {
    projectModel: Pick<ProjectModel, 'getSummary' | 'getDbtSourceIdentity'>;
    warehouseConnectionCompileModel: WarehouseConnectionCompileModel;
    warehouseConnectionModel: Pick<WarehouseConnectionModel, 'getProject'>;
    credentialPolicy: Pick<
        WarehouseCredentialPolicy,
        'assertCanWriteWarehouseConnection'
    >;
    analytics: Pick<LightdashAnalytics, 'track'>;
};

export class WarehouseConnectionBindingService extends BaseService {
    private readonly projectModel: Pick<
        ProjectModel,
        'getSummary' | 'getDbtSourceIdentity'
    >;

    private readonly warehouseConnectionCompileModel: WarehouseConnectionCompileModel;

    private readonly warehouseConnectionModel: Pick<
        WarehouseConnectionModel,
        'getProject'
    >;

    private readonly credentialPolicy: Pick<
        WarehouseCredentialPolicy,
        'assertCanWriteWarehouseConnection'
    >;

    private readonly analytics: Pick<LightdashAnalytics, 'track'>;

    constructor(args: WarehouseConnectionBindingServiceArguments) {
        super({ serviceName: 'WarehouseConnectionBindingService' });
        this.projectModel = args.projectModel;
        this.warehouseConnectionCompileModel =
            args.warehouseConnectionCompileModel;
        this.warehouseConnectionModel = args.warehouseConnectionModel;
        this.credentialPolicy = args.credentialPolicy;
        this.analytics = args.analytics;
    }

    private track(event: Parameters<LightdashAnalytics['track']>[0]): void {
        try {
            this.analytics.track(event);
        } catch (error) {
            this.logger.warn('Failed to track dbt source binding analytics', {
                error,
            });
        }
    }

    private async getBindingsForAnalytics(
        projectUuid: string,
    ): Promise<DbtSourceBindings | null> {
        try {
            return await this.warehouseConnectionCompileModel.getDbtSourceBindings(
                projectUuid,
            );
        } catch (error) {
            this.logger.warn(
                'Failed to read dbt source bindings for analytics',
                {
                    error,
                },
            );
            return null;
        }
    }

    private async getWarehouseTypeForAnalytics(
        projectUuid: string,
    ): Promise<WarehouseTypes | null> {
        try {
            return (await this.warehouseConnectionModel.getProject(projectUuid))
                .originalWarehouseType;
        } catch (error) {
            this.logger.warn(
                'Failed to read warehouse type for binding analytics',
                {
                    error,
                },
            );
            return null;
        }
    }

    private async assertCanManageProject(
        account: Account,
        projectUuid: string,
    ) {
        const summary = await this.projectModel.getSummary(projectUuid);
        if (
            this.createAuditedAbility(account).cannot(
                'manage',
                subject('Project', {
                    organizationUuid: summary.organizationUuid,
                    projectUuid,
                    metadata: { projectUuid, projectName: summary.name },
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage this project',
            );
        }
        return summary;
    }

    async getDbtSourceBindings(
        account: Account,
        projectUuid: string,
    ): Promise<DbtSourceBindings> {
        await this.assertCanManageProject(account, projectUuid);
        return this.warehouseConnectionCompileModel.getDbtSourceBindings(
            projectUuid,
        );
    }

    async bindDbtSource(
        account: Account,
        projectUuid: string,
        projectDbtSourceUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<void> {
        assertRegisteredAccount(account);
        const summary = await this.assertCanManageProject(account, projectUuid);
        this.credentialPolicy.assertCanWriteWarehouseConnection(
            account,
            summary,
            {},
        );
        const identity =
            await this.projectModel.getDbtSourceIdentity(projectUuid);
        if (projectDbtSourceUuid === identity.dbtSourceUuid) {
            const [bindings, warehouseType] = await Promise.all([
                this.getBindingsForAnalytics(projectUuid),
                this.getWarehouseTypeForAnalytics(projectUuid),
            ]);
            if (bindings !== null) {
                const target = bindings.connections.find((connection) =>
                    warehouseConnectionUuid === null
                        ? connection.isOriginal
                        : connection.warehouseConnectionUuid ===
                          warehouseConnectionUuid,
                );
                this.track({
                    event: 'warehouse_connection.action_refused',
                    userId: account.user.userUuid,
                    properties: {
                        organizationId: summary.organizationUuid,
                        projectId: projectUuid,
                        warehouseConnectionId:
                            target?.warehouseConnectionUuid ??
                            warehouseConnectionUuid,
                        warehouseType,
                        connectionKind:
                            target?.isOriginal === true ||
                            warehouseConnectionUuid === null
                                ? 'primary'
                                : 'extra',
                        credentialSource: null,
                        connectionCount: bindings.connections.length,
                        operation: 'rebind',
                        reason: 'primary_source',
                    },
                });
            }
            throw new ParameterError(
                'The primary dbt source always runs on the original connection',
            );
        }
        const [before, warehouseType] = await Promise.all([
            this.getBindingsForAnalytics(projectUuid),
            this.getWarehouseTypeForAnalytics(projectUuid),
        ]);
        await this.warehouseConnectionCompileModel.bindDbtSource(
            projectUuid,
            projectDbtSourceUuid,
            warehouseConnectionUuid,
        );
        if (before === null) return;
        const target = before.connections.find(
            (connection) =>
                connection.warehouseConnectionUuid === warehouseConnectionUuid,
        );
        const primary = before.connections.find(
            (connection) => connection.isOriginal,
        );
        const previousBinding = before.sources.find(
            (source) => source.projectDbtSourceUuid === projectDbtSourceUuid,
        );
        this.track({
            event: 'warehouse_connection.dbt_source_rebound',
            userId: account.user.userUuid,
            properties: {
                organizationId: summary.organizationUuid,
                projectId: projectUuid,
                dbtSourceId: projectDbtSourceUuid,
                warehouseConnectionId:
                    warehouseConnectionUuid === null
                        ? (primary?.warehouseConnectionUuid ?? null)
                        : warehouseConnectionUuid,
                previousWarehouseConnectionId:
                    previousBinding === undefined
                        ? null
                        : (previousBinding.warehouseConnectionUuid ??
                          primary?.warehouseConnectionUuid ??
                          null),
                warehouseType,
                connectionKind:
                    warehouseConnectionUuid === null ||
                    target?.isOriginal === true
                        ? 'primary'
                        : 'extra',
                credentialSource: null,
                connectionCount: before.connections.length,
            },
        });
    }
}
