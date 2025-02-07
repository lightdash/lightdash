import { UnexpectedIndexError } from '../types/errors';

export const getArrayValue = <T>(
    obj: ArrayLike<T> | undefined,
    key: number,
    errorMessage?: string,
): T => {
    if (obj === undefined) {
        throw new UnexpectedIndexError(
            errorMessage || `Cannot get key "${key}" value from empty array`,
        );
    }
    const value = obj[key];
    if (value === undefined) {
        // eslint-disable-next-line no-console
        console.trace();
        throw new UnexpectedIndexError(
            errorMessage || `Cannot get key "${key}" value from array`,
        );
    }
    return value;
};
export const getObjectValue = <T>(
    obj: Record<string | number, T> | undefined,
    key: string | number,
    errorMessage?: string,
): T => {
    if (obj === undefined) {
        throw new UnexpectedIndexError(
            errorMessage || `Cannot get key "${key}" value from empty object`,
        );
    }
    const value = obj[key];
    if (value === undefined) {
        // eslint-disable-next-line no-console
        console.trace();
        throw new UnexpectedIndexError(
            errorMessage || `Cannot get key "${key}" value from object`,
        );
    }
    return value;
};

export const hasProperty = <T>(
    obj: unknown,
    property: string,
): obj is { scope: T } =>
    typeof obj === 'object' && obj !== null && property in obj;
