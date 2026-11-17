export type MobileSignInOAuthErrorName =
    | 'invalid_request'
    | 'invalid_client'
    | 'invalid_grant'
    | 'expired_token'
    | 'authorization_pending'
    | 'match_number_required'
    | 'slow_down'
    | 'access_denied'
    | 'invalid_scope'
    | 'rate_limited';

export class MobileSignInOAuthError extends Error {
    readonly error: MobileSignInOAuthErrorName;

    readonly description: string | undefined;

    readonly statusCode: number;

    readonly retryAfterSeconds: number | undefined;

    readonly organizationUuid: string | undefined;

    constructor(
        error: MobileSignInOAuthErrorName,
        options: {
            description?: string;
            statusCode?: number;
            retryAfterSeconds?: number;
            organizationUuid?: string;
        } = {},
    ) {
        super(options.description ? `${error}: ${options.description}` : error);
        this.name = 'MobileSignInOAuthError';
        this.error = error;
        this.description = options.description;
        this.statusCode = options.statusCode ?? 400;
        this.retryAfterSeconds = options.retryAfterSeconds;
        this.organizationUuid = options.organizationUuid;
    }

    toJSON(): {
        error: string;
        error_description?: string;
        organization_uuid?: string;
    } {
        return {
            error: this.error,
            ...(this.description
                ? { error_description: this.description }
                : {}),
            ...(this.organizationUuid
                ? { organization_uuid: this.organizationUuid }
                : {}),
        };
    }
}
