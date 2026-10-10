import { type QueryResultProducer } from '@lightdash/common';
import * as crypto from 'crypto';

export function getCacheUserUuid(
    warehouseCredentials: { userWarehouseCredentialsUuid?: string },
    userId: string,
): string | null {
    return warehouseCredentials.userWarehouseCredentialsUuid ? userId : null;
}

export function buildCacheHash(
    parts: (string | null)[],
    identity: {
        organizationUuid: string;
        producer: QueryResultProducer;
    } | null = null,
): string {
    const value = identity
        ? JSON.stringify({ version: 2, parts, ...identity })
        : parts.join('.');
    return crypto.createHash('sha256').update(value).digest('hex');
}
