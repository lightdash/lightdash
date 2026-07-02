import { createHash } from 'crypto';
import { google } from 'googleapis';

type ServiceAccountKeyfile = {
    client_email: string;
    private_key: string;
};

// Refresh a little before the real expiry to absorb clock skew and request latency.
const EXPIRY_SKEW_MS = 60_000;
// Access tokens live ~1h; if Google doesn't report an expiry, assume ~55m.
const FALLBACK_TTL_MS = 3_300_000;

/**
 * Mints short-lived Google OAuth2 access tokens from a service account keyfile,
 * caching them in memory so the external-connection proxy doesn't sign + exchange
 * a JWT on every request. The cache key is a hash of (keyfile + scopes), so
 * rotating the secret or editing the scopes transparently invalidates the token.
 *
 * The mint calls Google's token endpoint (oauth2.googleapis.com) directly via
 * google-auth-library, bypassing secureFetch's SSRF guard — acceptable because
 * the endpoint is a fixed, trusted Google host.
 */
export class GoogleServiceAccountTokenProvider {
    private readonly cache = new Map<
        string,
        { token: string; expiresAt: number }
    >();

    /**
     * @param keyfileJson decrypted service account JSON (caller must have already
     *  validated it parses and has client_email + private_key)
     * @param scopes non-empty list of OAuth scopes
     */
    async getAccessToken(
        keyfileJson: string,
        scopes: string[],
    ): Promise<string> {
        const cacheKey = createHash('sha256')
            .update(`${keyfileJson}\n${[...scopes].sort().join(' ')}`)
            .digest('hex');

        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiresAt - Date.now() > EXPIRY_SKEW_MS) {
            return cached.token;
        }

        const key = JSON.parse(keyfileJson) as ServiceAccountKeyfile;
        const jwtClient = new google.auth.JWT({
            email: key.client_email,
            key: key.private_key,
            scopes,
        });
        const { token } = await jwtClient.getAccessToken();
        if (!token) {
            throw new Error('Google did not return an access token');
        }

        const expiresAt =
            jwtClient.credentials.expiry_date ?? Date.now() + FALLBACK_TTL_MS;
        this.cache.set(cacheKey, { token, expiresAt });
        return token;
    }
}
