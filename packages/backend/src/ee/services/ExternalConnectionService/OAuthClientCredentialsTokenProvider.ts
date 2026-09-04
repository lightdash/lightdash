import { createHash } from 'crypto';
import {
    secureFetch,
    type SecureFetchResult,
} from '../../../utils/secureFetch/secureFetch';

export type OAuthClientCredentialsConfig = {
    tokenUrl: string;
    clientId: string;
    clientAuthMethod: 'basic' | 'body';
    scopes: string[];
};

type FetchToken = (
    url: string,
    options: Parameters<typeof secureFetch>[1],
) => Promise<SecureFetchResult>;

const TOKEN_TIMEOUT_MS = 10_000;
const TOKEN_RESPONSE_MAX_BYTES = 64 * 1024;
const FALLBACK_TTL_MS = 5 * 60_000;
const MAX_EXPIRY_SKEW_MS = 60_000;

const formEncode = (value: string): string =>
    new URLSearchParams({ value }).toString().slice('value='.length);

/**
 * Mints and caches OAuth 2.0 client-credentials bearer tokens in process
 * memory. Each backend process has an independent cache, and a restart remints
 * tokens on the next request.
 */
export class OAuthClientCredentialsTokenProvider {
    private readonly cache = new Map<
        string,
        { token: string; usableUntil: number }
    >();

    private readonly inFlight = new Map<string, Promise<string>>();

    constructor(private readonly fetchToken: FetchToken = secureFetch) {}

    private static getCacheKey(
        config: OAuthClientCredentialsConfig,
        clientSecret: string,
    ): string {
        return createHash('sha256')
            .update(
                JSON.stringify({
                    ...config,
                    scopes: [...config.scopes].sort(),
                    clientSecret,
                }),
            )
            .digest('hex');
    }

    async getAccessToken(
        config: OAuthClientCredentialsConfig,
        clientSecret: string,
    ): Promise<string> {
        const cacheKey = OAuthClientCredentialsTokenProvider.getCacheKey(
            config,
            clientSecret,
        );
        const cached = this.cache.get(cacheKey);
        if (cached && cached.usableUntil > Date.now()) return cached.token;

        const pending = this.inFlight.get(cacheKey);
        if (pending) return pending;

        const mint = this.mint(config, clientSecret, cacheKey);
        this.inFlight.set(cacheKey, mint);
        try {
            return await mint;
        } finally {
            this.inFlight.delete(cacheKey);
        }
    }

    invalidateAccessToken(
        config: OAuthClientCredentialsConfig,
        clientSecret: string,
        rejectedToken: string,
    ): void {
        const cacheKey = OAuthClientCredentialsTokenProvider.getCacheKey(
            config,
            clientSecret,
        );
        if (this.cache.get(cacheKey)?.token === rejectedToken) {
            this.cache.delete(cacheKey);
        }
    }

    private async mint(
        config: OAuthClientCredentialsConfig,
        clientSecret: string,
        cacheKey: string,
    ): Promise<string> {
        const body = new URLSearchParams({ grant_type: 'client_credentials' });
        if (config.scopes.length > 0) {
            body.set('scope', config.scopes.join(' '));
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        };
        if (config.clientAuthMethod === 'basic') {
            const credentials = `${formEncode(config.clientId)}:${formEncode(
                clientSecret,
            )}`;
            headers.Authorization = `Basic ${Buffer.from(credentials).toString(
                'base64',
            )}`;
        } else {
            body.set('client_id', config.clientId);
            body.set('client_secret', clientSecret);
        }

        const response = await this.fetchToken(config.tokenUrl, {
            method: 'POST',
            body: body.toString(),
            headers,
            timeoutMs: TOKEN_TIMEOUT_MS,
            maxResponseBytes: TOKEN_RESPONSE_MAX_BYTES,
            allowedContentTypes: ['application/json'],
        });
        if (response.status < 200 || response.status >= 300) {
            throw new Error('OAuth token endpoint rejected the request');
        }

        let payload: unknown;
        try {
            payload = JSON.parse(response.bodyText);
        } catch {
            throw new Error('OAuth token endpoint returned invalid JSON');
        }
        if (!payload || typeof payload !== 'object') {
            throw new Error(
                'OAuth token endpoint returned an invalid response',
            );
        }
        const tokenResponse = payload as Record<string, unknown>;
        if (
            typeof tokenResponse.access_token !== 'string' ||
            tokenResponse.access_token.length === 0
        ) {
            throw new Error(
                'OAuth token endpoint did not return an access token',
            );
        }
        if (
            tokenResponse.token_type !== undefined &&
            (typeof tokenResponse.token_type !== 'string' ||
                tokenResponse.token_type.toLowerCase() !== 'bearer')
        ) {
            throw new Error('OAuth token endpoint returned a non-bearer token');
        }

        let parsedExpiresIn = Number.NaN;
        if (typeof tokenResponse.expires_in === 'number') {
            parsedExpiresIn = tokenResponse.expires_in;
        } else if (typeof tokenResponse.expires_in === 'string') {
            parsedExpiresIn = Number(tokenResponse.expires_in);
        }
        const ttlMs =
            Number.isFinite(parsedExpiresIn) && parsedExpiresIn > 0
                ? parsedExpiresIn * 1_000
                : FALLBACK_TTL_MS;
        const skewMs = Math.min(MAX_EXPIRY_SKEW_MS, ttlMs * 0.1);
        const now = Date.now();
        for (const [key, entry] of this.cache) {
            if (entry.usableUntil <= now) this.cache.delete(key);
        }
        this.cache.set(cacheKey, {
            token: tokenResponse.access_token,
            usableUntil: now + ttlMs - skewMs,
        });
        return tokenResponse.access_token;
    }
}
