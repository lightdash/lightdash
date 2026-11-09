export type MobileSignInOAuthErrorName =
    | 'invalid_request'
    | 'invalid_client'
    | 'invalid_grant'
    | 'expired_token'
    | 'authorization_pending'
    | 'slow_down'
    | 'access_denied'
    | 'rate_limited';

export class MobileSignInOAuthError extends Error {
    readonly error: MobileSignInOAuthErrorName;

    readonly description: string | undefined;

    readonly statusCode: number;

    readonly retryAfterSeconds: number | undefined;

    constructor(
        error: MobileSignInOAuthErrorName,
        options: {
            description?: string;
            statusCode?: number;
            retryAfterSeconds?: number;
        } = {},
    ) {
        super(options.description ? `${error}: ${options.description}` : error);
        this.name = 'MobileSignInOAuthError';
        this.error = error;
        this.description = options.description;
        this.statusCode = options.statusCode ?? 400;
        this.retryAfterSeconds = options.retryAfterSeconds;
    }

    toJSON(): { error: string; error_description?: string } {
        return this.description
            ? { error: this.error, error_description: this.description }
            : { error: this.error };
    }
}
