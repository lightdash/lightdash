import {
    BigqueryTokenError,
    DatabricksTokenError,
    getExpiredSharedSignInMessage,
    SnowflakeTokenError,
    type SharedSignInExpiry,
} from '@lightdash/common';

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
        sharedSignIn,
        viewerUserUuid,
    ) as unknown as T;
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
