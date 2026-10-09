import { z } from 'zod';
import { createSnowflakeAiPassportStrategy } from '../controllers/authentication/strategies/snowflakeAiStrategy';
import { type ResolvedSnowflakeAgentClient } from '../services/AiAccessService/SnowflakeAgentClientResolver';

export type SnowflakeRefreshResult = {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: Date | null;
    refreshTokenExpiresAt: Date | null;
};

type SnowflakeRefreshFailure =
    | { kind: 'grant_gone' }
    | { kind: 'temporary' }
    | { kind: 'configuration' };

const httpErrorSchema = z.object({
    statusCode: z.number(),
    data: z.unknown().optional(),
});
const oauthErrorSchema = z.object({ error: z.string() });
const expirySchema = z.object({
    expires_in: z.unknown().optional(),
    refresh_token_expires_in: z.unknown().optional(),
});

export const classifySnowflakeRefreshError = (
    error: unknown,
): SnowflakeRefreshFailure => {
    const parsed = httpErrorSchema.safeParse(error);
    if (!parsed.success) return { kind: 'temporary' };
    const { statusCode, data } = parsed.data;
    if (statusCode === 408 || statusCode === 429 || statusCode >= 500)
        return { kind: 'temporary' };
    if (typeof data !== 'string') return { kind: 'configuration' };
    try {
        const body = oauthErrorSchema.safeParse(JSON.parse(data));
        if (!body.success) return { kind: 'configuration' };
        switch (body.data.error) {
            case 'invalid_grant':
                return { kind: 'grant_gone' };
            case 'server_error':
            case 'temporarily_unavailable':
                return { kind: 'temporary' };
            default:
                return { kind: 'configuration' };
        }
    } catch {
        return { kind: 'configuration' };
    }
};

const expiryFromSeconds = (value: unknown, now: Date): Date | null => {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    const expiresAt = new Date(now.getTime() + seconds * 1000);
    return Number.isFinite(expiresAt.getTime()) ? expiresAt : null;
};

type RefreshCallback = (
    error: unknown,
    accessToken?: string,
    refreshToken?: string,
    results?: unknown,
) => void;

export const snowflakeOAuthRefreshClient = {
    requestNewAccessToken(
        client: ResolvedSnowflakeAgentClient,
        refreshToken: string,
        callback: RefreshCallback,
    ): void {
        const strategy = createSnowflakeAiPassportStrategy(
            client,
        ) as unknown as {
            _oauth2: {
                getOAuthAccessToken(
                    token: string,
                    params: { grant_type: string },
                    done: RefreshCallback,
                ): void;
            };
        };
        strategy._oauth2.getOAuthAccessToken(
            refreshToken,
            { grant_type: 'refresh_token' },
            callback,
        );
    },
};

export const exchangeSnowflakeRefreshToken = ({
    client,
    refreshToken,
    now,
    requestNewAccessToken = snowflakeOAuthRefreshClient.requestNewAccessToken,
}: {
    client: ResolvedSnowflakeAgentClient;
    refreshToken: string;
    now: Date;
    requestNewAccessToken?: typeof snowflakeOAuthRefreshClient.requestNewAccessToken;
}): Promise<SnowflakeRefreshResult> =>
    new Promise((resolve, reject) => {
        requestNewAccessToken(
            client,
            refreshToken,
            (error, accessToken, newRefreshToken, results: unknown) => {
                if (error || !accessToken) {
                    reject(error);
                    return;
                }
                const metadata = expirySchema.safeParse(results);
                resolve({
                    accessToken,
                    refreshToken: newRefreshToken || refreshToken,
                    accessTokenExpiresAt: expiryFromSeconds(
                        metadata.success ? metadata.data.expires_in : null,
                        now,
                    ),
                    refreshTokenExpiresAt: expiryFromSeconds(
                        metadata.success
                            ? metadata.data.refresh_token_expires_in
                            : null,
                        now,
                    ),
                });
            },
        );
    });
