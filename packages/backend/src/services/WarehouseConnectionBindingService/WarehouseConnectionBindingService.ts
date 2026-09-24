import { subject } from '@casl/ability';
import { ForbiddenError, type Account } from '@lightdash/common';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type WarehouseConnectionCompileModel } from '../../models/WarehouseConnectionCompileModel/WarehouseConnectionCompileModel';
import { BaseService } from '../BaseService';
import { type WarehouseCredentialPolicy } from '../WarehouseConnectionService/WarehouseConnectionService';

type WarehouseConnectionBindingServiceArguments = {
    projectModel: Pick<ProjectModel, 'getSummary'>;
    warehouseConnectionCompileModel: WarehouseConnectionCompileModel;
    credentialPolicy: Pick<
        WarehouseCredentialPolicy,
        'assertCanWriteWarehouseConnection'
    >;
};

export class WarehouseConnectionBindingService extends BaseService {
    private readonly projectModel: Pick<ProjectModel, 'getSummary'>;

    private readonly warehouseConnectionCompileModel: WarehouseConnectionCompileModel;

    private readonly credentialPolicy: Pick<
        WarehouseCredentialPolicy,
        'assertCanWriteWarehouseConnection'
    >;

    constructor(args: WarehouseConnectionBindingServiceArguments) {
        super({ serviceName: 'WarehouseConnectionBindingService' });
        this.projectModel = args.projectModel;
        this.warehouseConnectionCompileModel =
            args.warehouseConnectionCompileModel;
        this.credentialPolicy = args.credentialPolicy;
    }

    async bindDbtSource(
        account: Account,
        projectUuid: string,
        projectDbtSourceUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<void> {
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
        this.credentialPolicy.assertCanWriteWarehouseConnection(
            account,
            summary,
            {},
        );
        await this.warehouseConnectionCompileModel.bindDbtSource(
            projectUuid,
            projectDbtSourceUuid,
            warehouseConnectionUuid,
        );
    }
}
