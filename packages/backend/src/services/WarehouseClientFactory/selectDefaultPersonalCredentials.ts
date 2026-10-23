import {
    allowsOptionalUserCredentials,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type UserWarehouseCredentialsWithSecrets,
} from '@lightdash/common';
import { normalizeDatabricksHostLenient } from '../../controllers/authentication/strategies/databricksStrategy';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import type { PersonalCredentialPersistencePolicy } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import type { WarehouseConnectionModel } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { mergePersonalWarehouseCredentials } from '../ProjectService/personalWarehouseCredentials';
import {
    composePersonalWarehouseCredentials,
    projectPersonalWarehouseCredentials,
} from './personalCredentialOverlay';
import { resolvePersonalCredentialPolicy } from './personalCredentialPolicy';

export const selectDefaultPersonalCredentials = async (
    deps: {
        featureFlagModel: Pick<FeatureFlagModel, 'get'>;
        userWarehouseCredentialsModel: Pick<
            UserWarehouseCredentialsModel,
            'findForProjectWithSecrets' | 'getByUuidWithSecrets'
        >;
    },
    credentials: CreateWarehouseCredentials,
    projectUuid: string,
    user: { userUuid: string; organizationUuid: string | null },
    target:
        | { kind: 'original' }
        | {
              kind: 'extra';
              warehouseConnectionUuid: string;
              model: Pick<
                  WarehouseConnectionModel,
                  | 'findPreferredUserCredentialsUuid'
                  | 'findSoleUnclaimedUserCredentialsUuid'
              >;
          } = { kind: 'original' },
) => {
    const shouldFetch =
        credentials.requireUserCredentials ||
        allowsOptionalUserCredentials(credentials);
    const policy = shouldFetch
        ? await resolvePersonalCredentialPolicy(deps.featureFlagModel, user)
        : { strictPersonalOverlay: false };
    let claimPreference = false;
    let candidate: UserWarehouseCredentialsWithSecrets | undefined;
    if (shouldFetch && target.kind === 'original') {
        candidate =
            await deps.userWarehouseCredentialsModel.findForProjectWithSecrets(
                projectUuid,
                user.userUuid,
                credentials.type,
                policy,
            );
    } else if (shouldFetch && target.kind === 'extra') {
        const lookup = {
            userUuid: user.userUuid,
            projectUuid,
            warehouseConnectionUuid: target.warehouseConnectionUuid,
            warehouseType: credentials.type,
        };
        let uuid = await target.model.findPreferredUserCredentialsUuid(
            lookup,
            policy,
        );
        if (uuid === null && credentials.requireUserCredentials) {
            uuid =
                await target.model.findSoleUnclaimedUserCredentialsUuid(lookup);
            claimPreference = uuid !== null;
        }
        if (uuid !== null) {
            candidate =
                await deps.userWarehouseCredentialsModel.getByUuidWithSecrets(
                    uuid,
                    undefined,
                    policy,
                );
            if (!policy.strictPersonalOverlay) {
                const error =
                    UserWarehouseCredentialsModel.getQueryTimeValidationError(
                        candidate.credentials,
                    );
                if (error) throw error;
            }
        }
    }
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
        claimPreference,
        userWarehouseCredentials: hostMismatch ? undefined : candidate,
        hostMismatch,
    };
};

export const composeSelectedPersonalCredentials = (
    credentials: CreateWarehouseCredentials,
    personal: UserWarehouseCredentialsWithSecrets,
    policy: PersonalCredentialPersistencePolicy,
): CreateWarehouseCredentials =>
    policy.strictPersonalOverlay
        ? composePersonalWarehouseCredentials(
              credentials,
              projectPersonalWarehouseCredentials(personal.credentials),
          )
        : mergePersonalWarehouseCredentials(credentials, personal);
