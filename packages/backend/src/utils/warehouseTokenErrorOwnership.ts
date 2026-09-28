import {
    isWarehouseTokenError,
    type WarehouseCredentialsOwnership,
} from '@lightdash/common';

export const attributeWarehouseTokenError = (
    error: unknown,
    ownership: WarehouseCredentialsOwnership,
): unknown => {
    if (!isWarehouseTokenError(error) || error.data.credentialsOwner !== null) {
        return error;
    }
    const attributed = error.withCredentialsOwner(ownership);
    // Keep the original frames but show the attributed message in logs
    const frames = error.stack?.split('\n').slice(1).join('\n');
    attributed.stack = frames
        ? `${attributed.name}: ${attributed.message}\n${frames}`
        : attributed.stack;
    return attributed;
};

/**
 * Warehouse clients can't know whose credential they were built from, so token
 * errors they throw are attributed to the credential owner as they leave the client.
 */
export const withWarehouseTokenErrorOwnership = <T extends object>(
    client: T,
    ownership: WarehouseCredentialsOwnership,
): T =>
    new Proxy(client, {
        get(target, property, receiver) {
            const value: unknown = Reflect.get(target, property, receiver);
            if (typeof value !== 'function') {
                return value;
            }
            return (...args: unknown[]) => {
                try {
                    const result: unknown = value.apply(target, args);
                    if (result instanceof Promise) {
                        return result.catch((error: unknown) => {
                            throw attributeWarehouseTokenError(
                                error,
                                ownership,
                            );
                        });
                    }
                    return result;
                } catch (error) {
                    throw attributeWarehouseTokenError(error, ownership);
                }
            };
        },
    });
