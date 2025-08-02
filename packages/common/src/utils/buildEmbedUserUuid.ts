import crypto from 'crypto';

/**
 * Generate deterministic UUID from external ID using MD5 hash
 * Conforms to UUID v4 format: [0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}
 * @see {@link packages/common/src/types/api/uuid.ts}
 * @see {@link [RFC 4112](https://tools.ietf.org/html/rfc4122)}
 */
export const buildEmbedUserUuid = (externalId: string): string => {
    if (!externalId) {
        throw new Error('External ID is required to build an embed user UUID');
    }

    const hash = crypto.createHash('md5').update(externalId).digest('hex');

    return [
        hash.substring(0, 8),
        hash.substring(8, 12),
        // Force '4' as first character
        `4${hash.substring(13, 16)}`,
        // Force '8' as first character (valid UUID v4 variant)
        `8${hash.substring(17, 20)}`,
        hash.substring(20, 32),
    ].join('-');
};
