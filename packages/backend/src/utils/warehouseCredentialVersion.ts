import { deepEqual } from '@lightdash/common';
import { randomUUID } from 'crypto';

type StoredCredentialVersion = { resultIdentityVersion?: string };
const credentialVersions = new WeakMap<object, readonly string[]>();

export const stripWarehouseCredentialVersion = <T extends object>(
    credentials: T,
): T => {
    const { resultIdentityVersion, ...value } = credentials as T &
        StoredCredentialVersion;
    return value as T;
};

export const getWarehouseCredentialVersions = (
    credentials: object,
): readonly string[] => {
    const stored = (credentials as StoredCredentialVersion)
        .resultIdentityVersion;
    return credentialVersions.get(credentials) ?? (stored ? [stored] : []);
};

export const getWarehouseCredentialVersion = (
    credentials: object,
): string | null => getWarehouseCredentialVersions(credentials)[0] ?? null;

export const withWarehouseCredentialVersions = <T extends object>(
    credentials: T,
    versions: readonly string[],
): T => {
    const value = stripWarehouseCredentialVersion(credentials);
    credentialVersions.set(value, [...versions]);
    return value;
};

export const copyWarehouseCredentialVersions = <T extends object>(
    credentials: T,
    ...sources: object[]
): T => {
    const value = stripWarehouseCredentialVersion(credentials);
    credentialVersions.set(
        value,
        sources.flatMap(getWarehouseCredentialVersions),
    );
    return value;
};

export const withWarehouseCredentialVersion = <T extends object>(
    credentials: T,
    fallback: string,
): T => {
    const value = stripWarehouseCredentialVersion(credentials);
    const versions = getWarehouseCredentialVersions(credentials);
    credentialVersions.set(value, versions.length > 0 ? versions : [fallback]);
    return value;
};

const persistedCredentialShape = (credentials: object): object => {
    try {
        return JSON.parse(
            JSON.stringify(stripWarehouseCredentialVersion(credentials)),
        ) as object;
    } catch {
        throw new Error('Could not encode warehouse credentials');
    }
};

export const withPreservedWarehouseCredentialVersion = <T extends object>(
    credentials: T,
    stored: object,
): T & StoredCredentialVersion => ({
    ...stripWarehouseCredentialVersion(credentials),
    resultIdentityVersion:
        getWarehouseCredentialVersion(stored) ?? randomUUID(),
});

export const withNewWarehouseCredentialVersion = <T extends object>(
    credentials: T,
    stored: object | null = null,
): T & StoredCredentialVersion => ({
    ...stripWarehouseCredentialVersion(credentials),
    resultIdentityVersion:
        stored !== null &&
        deepEqual(
            persistedCredentialShape(credentials),
            persistedCredentialShape(stored),
        )
            ? (getWarehouseCredentialVersion(stored) ?? randomUUID())
            : randomUUID(),
});
