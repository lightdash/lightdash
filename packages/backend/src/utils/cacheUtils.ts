import * as crypto from 'crypto';

export function getCacheUserUuid(
    warehouseCredentials: { userWarehouseCredentialsUuid?: string },
    userId: string,
): string | null {
    return warehouseCredentials.userWarehouseCredentialsUuid ? userId : null;
}

export function buildCacheHash(parts: (string | null)[]): string {
    return crypto.createHash('sha256').update(parts.join('.')).digest('hex');
}
