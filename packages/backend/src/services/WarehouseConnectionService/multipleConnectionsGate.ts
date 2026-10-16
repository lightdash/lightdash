import {
    FeatureFlags,
    isUserConnectableWarehouseConnection,
    supportsMultipleConnections,
    WarehouseTypes,
    type RegisteredAccount,
} from '@lightdash/common';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type FeatureFlagService } from '../FeatureFlag/FeatureFlagService';
import { type LicenseService } from '../LicenseService/LicenseService';

export const WAREHOUSE_TYPE_REASON =
    'Multiple connections require a user-connectable warehouse connection.';
export const ENTITLEMENT_REASON =
    'An extra connection needs the Enterprise multi-connection add-on.';
export const ROLLOUT_REASON =
    'Extra connections are not enabled for this organisation yet.';

export const getMultipleConnectionsBlockReason = async (
    {
        licenseService,
        featureFlagService,
    }: {
        licenseService: Pick<LicenseService, 'canHoldMultipleConnections'>;
        featureFlagService: Pick<FeatureFlagService, 'get'>;
    },
    account: RegisteredAccount,
    project: {
        organizationUuid: string;
        originalWarehouseType: WarehouseTypes | null;
    },
): Promise<string | null> => {
    if (!supportsMultipleConnections(project.originalWarehouseType)) {
        return WAREHOUSE_TYPE_REASON;
    }
    if (!licenseService.canHoldMultipleConnections(project.organizationUuid)) {
        return ENTITLEMENT_REASON;
    }
    const { enabled } = await featureFlagService.get({
        user: {
            userUuid: account.user.userUuid,
            organizationUuid: project.organizationUuid,
        },
        featureFlagId: FeatureFlags.MultiConnectionProjects,
    });
    return enabled ? null : ROLLOUT_REASON;
};

export const getProvisionedOriginalBlockReason = async (
    projectModel: Pick<ProjectModel, 'getWarehouseCredentialsForProject'>,
    project: {
        projectUuid: string;
        originalWarehouseType: WarehouseTypes | null;
    },
): Promise<string | null> =>
    project.originalWarehouseType === WarehouseTypes.DUCKDB &&
    !isUserConnectableWarehouseConnection(
        await projectModel.getWarehouseCredentialsForProject(
            project.projectUuid,
        ),
    )
        ? WAREHOUSE_TYPE_REASON
        : null;
