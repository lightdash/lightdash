import {
    BigqueryTokenError,
    DatabricksTokenError,
    FeatureFlags,
    getExpiredSharedSignInMessage,
    getPersonSignIn,
    PersonSignInProvider,
    SnowflakeTokenError,
    type Account,
    type SharedSignInExpiry,
} from '@lightdash/common';
import type { FeatureFlagModel } from '../models/FeatureFlagModel/FeatureFlagModel';
import type { ProjectModel } from '../models/ProjectModel/ProjectModel';

export type WarehouseTokenError =
    | BigqueryTokenError
    | SnowflakeTokenError
    | DatabricksTokenError;

export const isWarehouseTokenError = (
    error: unknown,
): error is WarehouseTokenError =>
    error instanceof BigqueryTokenError ||
    error instanceof SnowflakeTokenError ||
    error instanceof DatabricksTokenError;

export const withSharedSignInExpiry = (
    error: WarehouseTokenError,
    sharedSignIn: SharedSignInExpiry,
    viewerUserUuid: string | null,
): WarehouseTokenError => {
    const message = getExpiredSharedSignInMessage(sharedSignIn, viewerUserUuid);
    if (error instanceof BigqueryTokenError) {
        return new BigqueryTokenError(message, { sharedSignIn });
    }
    if (error instanceof SnowflakeTokenError) {
        return new SnowflakeTokenError(message, { sharedSignIn });
    }
    return new DatabricksTokenError(message, { sharedSignIn });
};

export const personaliseSharedSignInError = <T>(
    error: T,
    viewerUserUuid: string | null,
): T => {
    if (!isWarehouseTokenError(error)) return error;
    const { sharedSignIn } = error.data as {
        sharedSignIn?: SharedSignInExpiry;
    };
    if (!sharedSignIn) return error;
    return withSharedSignInExpiry(
        error,
        viewerUserUuid === null
            ? { ...sharedSignIn, subjectUserUuid: null, subjectName: null }
            : sharedSignIn,
        viewerUserUuid,
    ) as unknown as T;
};

export const personaliseStoredSharedSignInError = async ({
    account,
    projectUuid,
    error,
    projectModel,
    featureFlagModel,
}: {
    account: Account;
    projectUuid: string;
    error: string | null;
    projectModel: ProjectModel;
    featureFlagModel: FeatureFlagModel;
}): Promise<string | null> => {
    if (
        !error ||
        !account.isRegisteredUser() ||
        (!account.isSessionUser() && !account.isPatUser())
    )
        return error;
    if (
        !Object.values(PersonSignInProvider).some(
            (provider) =>
                error ===
                getExpiredSharedSignInMessage(
                    {
                        provider,
                        subjectUserUuid: null,
                        subjectName: null,
                        subjectBasis: null,
                    },
                    null,
                ),
        )
    )
        return error;
    const { enabled } = await featureFlagModel.get({
        user: { organizationUuid: account.organization.organizationUuid },
        featureFlagId: FeatureFlags.SharedSignInExpiryMessage,
    });
    if (!enabled) return error;
    try {
        const credentials =
            await projectModel.getWarehouseCredentialsForProject(projectUuid);
        const signIn = getPersonSignIn(credentials);
        if (!signIn) return error;
        const genericExpiry: SharedSignInExpiry = {
            projectUuid,
            provider: signIn.provider,
            subjectUserUuid: null,
            subjectName: null,
            subjectBasis: null,
        };
        if (error !== getExpiredSharedSignInMessage(genericExpiry, null))
            return error;
        const stored = await projectModel.getSharedSignInSubjectForToken(
            projectUuid,
            signIn.refreshToken,
        );
        if (!stored) return error;
        return getExpiredSharedSignInMessage(
            {
                provider: stored.provider,
                subjectUserUuid: stored.subject?.userUuid ?? null,
                subjectName: stored.subject?.name ?? null,
                subjectBasis: stored.basis,
            },
            account.user.id,
        );
    } catch {
        return error;
    }
};

export const attributeClientErrors = <T extends object>(
    client: T,
    onError: (error: unknown) => Promise<never>,
): T =>
    new Proxy(client, {
        get(target, property) {
            const value = Reflect.get(target, property, target);
            if (typeof value !== 'function') return value;
            return (...args: unknown[]) => {
                const result = value.apply(target, args);
                return result instanceof Promise
                    ? result.catch(onError)
                    : result;
            };
        },
    });
