import { parseAppStoreConnectSecret } from '@lightdash/common';
import { createHash } from 'crypto';
import { importPKCS8, SignJWT } from 'jose';

// Apple refuses tokens that expire more than 20 minutes after they are issued
const TOKEN_TTL_MS = 15 * 60_000;
const REFRESH_BEFORE_EXPIRY_MS = 2 * 60_000;
const AUDIENCE = 'appstoreconnect-v1';

/**
 * Signs App Store Connect API tokens from a team API key, caching each one
 * in memory until shortly before it expires. The cache key is a hash of the
 * secret, so rotating the key signs a new token.
 */
export class AppStoreConnectTokenProvider {
    private readonly cache = new Map<
        string,
        { token: string; expiresAt: number }
    >();

    constructor(private readonly now: () => number = Date.now) {}

    async getToken(secret: string): Promise<string> {
        const cacheKey = createHash('sha256').update(secret).digest('hex');
        const now = this.now();
        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiresAt - now > REFRESH_BEFORE_EXPIRY_MS) {
            return cached.token;
        }

        const key = parseAppStoreConnectSecret(secret);
        if (!key) {
            throw new Error('Invalid App Store Connect key');
        }
        const privateKey = await importPKCS8(key.privateKey, 'ES256');
        const issuedAt = Math.floor(now / 1000);
        const expiresAt = now + TOKEN_TTL_MS;
        const token = await new SignJWT({})
            .setProtectedHeader({ alg: 'ES256', kid: key.keyId, typ: 'JWT' })
            .setIssuer(key.issuerId)
            .setAudience(AUDIENCE)
            .setIssuedAt(issuedAt)
            .setExpirationTime(Math.floor(expiresAt / 1000))
            .sign(privateKey);

        for (const [k, v] of this.cache) {
            if (v.expiresAt <= now) {
                this.cache.delete(k);
            }
        }
        this.cache.set(cacheKey, { token, expiresAt });
        return token;
    }
}
