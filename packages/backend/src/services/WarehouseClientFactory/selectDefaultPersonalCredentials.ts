import {
    allowsOptionalUserCredentials,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { normalizeDatabricksHostLenient } from '../../controllers/authentication/strategies/databricksStrategy';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { resolvePersonalCredentialPolicy } from './personalCredentialPolicy';

export const selectDefaultPersonalCredentials = async (
    deps: {
        featureFlagModel: Pick<FeatureFlagModel, 'get'>;
        userWarehouseCredentialsModel: Pick<
            UserWarehouseCredentialsModel,
            'findForProjectWithSecrets'
        >;
    },
    credentials: CreateWarehouseCredentials,
    projectUuid: string,
    user: { userUuid: string; organizationUuid: string | null },
) => {
    const shouldFetch =
        credentials.requireUserCredentials ||
        allowsOptionalUserCredentials(credentials);
    const policy = shouldFetch
        ? await resolvePersonalCredentialPolicy(deps.featureFlagModel, user)
        : { strictPersonalOverlay: false };
    const candidate = shouldFetch
        ? await deps.userWarehouseCredentialsModel.findForProjectWithSecrets(
              projectUuid,
              user.userUuid,
              credentials.type,
              policy,
          )
        : undefined;
    const userHost =
        !policy.strictPersonalOverlay &&
        candidate?.credentials.type === WarehouseTypes.DATABRICKS &&
        'serverHostName' in candidate.credentials
            ? normalizeDatabricksHostLenient(
                  candidate.credentials.serverHostName,
              )
            : undefined;
    const projectHost =
        !policy.strictPersonalOverlay &&
        credentials.type === WarehouseTypes.DATABRICKS
            ? normalizeDatabricksHostLenient(credentials.serverHostName)
            : undefined;
    const hostMismatch = !!(
        userHost &&
        projectHost &&
        userHost !== projectHost
    );
    return {
        policy,
        userWarehouseCredentials: hostMismatch ? undefined : candidate,
        hostMismatch,
    };
};
