import {
    FeatureFlags,
    UserWarehouseCredentialPurpose,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import type { FeatureFlagModel } from '../models/FeatureFlagModel/FeatureFlagModel';
import type {
    PersonalSignInSnapshot,
    UserWarehouseCredentialsModel,
} from '../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import type { CredentialOwner } from '../services/WarehouseClientFactory/CredentialResolver';
import { isWarehouseTokenError } from './sharedSignInExpiry';

export type PersonalSignInDependencies = {
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
    userWarehouseCredentialsModel: Pick<
        UserWarehouseCredentialsModel,
        'getSignInSnapshot' | 'markNeedsSignIn'
    >;
    logger: { warn: (message: string) => void };
};

export type PersonalSignIn = {
    snapshot: PersonalSignInSnapshot;
    organizationUuid: string | null;
};

export const personalSignIn = Symbol('personalSignIn');
export type PersonalSignInCredentials = CreateWarehouseCredentials & {
    [personalSignIn]?: PersonalSignIn | null;
};

export const capturePersonalSignIn = async (
    deps: PersonalSignInDependencies,
    owner: CredentialOwner | null,
    credentials: CreateWarehouseCredentials,
    organizationUuid: string | null,
): Promise<PersonalSignIn | null> => {
    if (
        owner?.kind !== 'user' ||
        owner.purpose !== UserWarehouseCredentialPurpose.DEFAULT
    )
        return null;
    try {
        const snapshot =
            await deps.userWarehouseCredentialsModel.getSignInSnapshot(
                owner.uuid,
                credentials,
            );
        return snapshot ? { snapshot, organizationUuid } : null;
    } catch {
        deps.logger.warn('Could not read personal warehouse sign-in status');
        return null;
    }
};

export const markPersonalSignInRejection = async (
    deps: PersonalSignInDependencies,
    signIn: PersonalSignIn | null,
    error: unknown,
    rejectedRefreshToken: string | undefined,
): Promise<boolean> => {
    if (
        !signIn ||
        !isWarehouseTokenError(error) ||
        !error.data.rejection ||
        rejectedRefreshToken !== signIn.snapshot.refreshToken
    )
        return false;
    try {
        const { enabled } = await deps.featureFlagModel.get({
            featureFlagId: FeatureFlags.SharedSignInExpiryMessage,
            user: {
                userUuid: signIn.snapshot.userUuid,
                ...(signIn.organizationUuid
                    ? { organizationUuid: signIn.organizationUuid }
                    : {}),
            },
        });
        if (!enabled) return false;
    } catch {
        deps.logger.warn('Could not read personal warehouse sign-in policy');
        return false;
    }
    try {
        await deps.userWarehouseCredentialsModel.markNeedsSignIn(
            signIn.snapshot,
            error.data.rejection,
        );
    } catch {
        deps.logger.warn('Could not mark personal warehouse sign-in status');
    }
    return true;
};

export const isPersonalSignInExpiryEnabled = async (
    featureFlagModel: Pick<FeatureFlagModel, 'get'>,
    user: { userUuid: string; organizationUuid?: string | null },
): Promise<boolean> => {
    try {
        const { enabled } = await featureFlagModel.get({
            featureFlagId: FeatureFlags.SharedSignInExpiryMessage,
            user: {
                userUuid: user.userUuid,
                ...(user.organizationUuid
                    ? { organizationUuid: user.organizationUuid }
                    : {}),
            },
        });
        return enabled;
    } catch {
        return false;
    }
};
