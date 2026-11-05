import { z } from 'zod';
import {
    secureFetch,
    type AllowedPrivateHostCidrs,
    type SecureFetchResult,
} from '../../../utils/secureFetch/secureFetch';

/** What an authorization-code connection keeps in its encrypted secret. */
export type StoredOAuthTokens = {
    accessToken: string;
    refreshToken: string | null;
    /** Epoch milliseconds, or null when the server gave no lifetime. */
    expiresAt: number | null;
};

export type OAuthAuthorizationCodeClientConfig = {
    tokenUrl: string;
    clientId: string;
    clientSecret: string | null;
};

/** The token endpoint refused the grant: access was revoked or the refresh token expired. */
export class OAuthGrantRejectedError extends Error {}

type FetchToken = (
    url: string,
    options: Parameters<typeof secureFetch>[1],
) => Promise<SecureFetchResult>;

const TOKEN_TIMEOUT_MS = 10_000;
const TOKEN_RESPONSE_MAX_BYTES = 64 * 1024;
const EXPIRY_SKEW_MS = 60_000;

const storedTokensSchema = z.object({
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1).nullable(),
    expiresAt: z.number().nullable(),
});

const tokenResponseSchema = z
    .object({
        access_token: z.string().min(1),
        token_type: z.string().optional(),
        refresh_token: z.string().min(1).optional(),
        expires_in: z.coerce.number().positive().optional(),
    })
    .passthrough();

const errorResponseSchema = z.object({ error: z.string() }).passthrough();

export const parseStoredOAuthTokens = (
    secret: string | null,
): StoredOAuthTokens | null => {
    if (!secret) return null;
    let value: unknown;
    try {
        value = JSON.parse(secret);
    } catch {
        return null;
    }
    const parsed = storedTokensSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
};

export const serializeStoredOAuthTokens = (tokens: StoredOAuthTokens) =>
    JSON.stringify(tokens);

export const isAccessTokenFresh = (tokens: StoredOAuthTokens, now: number) =>
    tokens.expiresAt === null || tokens.expiresAt - EXPIRY_SKEW_MS > now;

/** Exchanges and refreshes OAuth 2.0 authorization-code grants. Stores nothing itself. */
export class OAuthAuthorizationCodeTokenClient {
    private readonly allowedPrivateHostCidrs: AllowedPrivateHostCidrs;

    private readonly fetchToken: FetchToken;

    private readonly now: () => number;

    constructor(args: {
        allowedPrivateHostCidrs: AllowedPrivateHostCidrs;
        fetchToken?: FetchToken;
        now?: () => number;
    }) {
        this.allowedPrivateHostCidrs = args.allowedPrivateHostCidrs;
        this.fetchToken = args.fetchToken ?? secureFetch;
        this.now = args.now ?? Date.now;
    }

    async exchangeCode(
        client: OAuthAuthorizationCodeClientConfig,
        grant: { code: string; redirectUri: string; codeVerifier: string },
    ): Promise<{
        tokens: StoredOAuthTokens;
        response: Record<string, unknown>;
    }> {
        const response = await this.requestToken(client, {
            grant_type: 'authorization_code',
            code: grant.code,
            redirect_uri: grant.redirectUri,
            code_verifier: grant.codeVerifier,
        });
        return { tokens: this.toStoredTokens(response, null), response };
    }

    /** Keeps the current refresh token when the server does not rotate it. */
    async refresh(
        client: OAuthAuthorizationCodeClientConfig,
        refreshToken: string,
    ): Promise<StoredOAuthTokens> {
        const response = await this.requestToken(client, {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        });
        return this.toStoredTokens(response, refreshToken);
    }

    private toStoredTokens(
        response: z.infer<typeof tokenResponseSchema>,
        currentRefreshToken: string | null,
    ): StoredOAuthTokens {
        return {
            accessToken: response.access_token,
            refreshToken: response.refresh_token ?? currentRefreshToken,
            expiresAt:
                response.expires_in !== undefined
                    ? this.now() + response.expires_in * 1_000
                    : null,
        };
    }

    private async requestToken(
        client: OAuthAuthorizationCodeClientConfig,
        params: Record<string, string>,
    ): Promise<z.infer<typeof tokenResponseSchema>> {
        const body = new URLSearchParams({
            ...params,
            client_id: client.clientId,
        });
        if (client.clientSecret) body.set('client_secret', client.clientSecret);

        const response = await this.fetchToken(client.tokenUrl, {
            method: 'POST',
            body: body.toString(),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            },
            timeoutMs: TOKEN_TIMEOUT_MS,
            maxResponseBytes: TOKEN_RESPONSE_MAX_BYTES,
            allowedContentTypes: ['application/json'],
            allowedPrivateHostCidrs: this.allowedPrivateHostCidrs,
        });

        let payload: unknown;
        try {
            payload = JSON.parse(response.bodyText);
        } catch {
            payload = null;
        }

        if (response.status < 200 || response.status >= 300) {
            const error = errorResponseSchema.safeParse(payload);
            if (
                response.status === 401 ||
                (error.success && error.data.error === 'invalid_grant')
            ) {
                throw new OAuthGrantRejectedError(
                    'OAuth token endpoint rejected the grant',
                );
            }
            throw new Error(
                `OAuth token endpoint returned ${response.status}${
                    error.success ? ` (${error.data.error})` : ''
                }`,
            );
        }

        const parsed = tokenResponseSchema.safeParse(payload);
        if (!parsed.success) {
            throw new Error(
                'OAuth token endpoint returned an invalid response',
            );
        }
        if (
            parsed.data.token_type !== undefined &&
            parsed.data.token_type.toLowerCase() !== 'bearer'
        ) {
            throw new Error('OAuth token endpoint returned a non-bearer token');
        }
        return parsed.data;
    }
}
