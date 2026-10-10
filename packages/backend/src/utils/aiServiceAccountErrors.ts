import {
    assertUnreachable,
    WarehouseConnectionError,
    WarehouseQueryError,
    WarehouseTypes,
} from '@lightdash/common';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

export const isBigqueryServiceAccountAuthError = (
    error: unknown,
    ancestors = new Set<unknown>(),
): boolean => {
    if (!isRecord(error) || ancestors.has(error)) return false;
    const nextAncestors = new Set(ancestors).add(error);
    if (
        error.code === 401 ||
        error.status === 401 ||
        error.statusCode === 401 ||
        error.code === 'UNAUTHENTICATED' ||
        error.status === 'UNAUTHENTICATED' ||
        error.error === 'invalid_grant'
    )
        return true;
    if (
        error.reason === 'invalidQuery' ||
        error.reason === 'accessDenied' ||
        error.reason === 'quotaExceeded'
    )
        return false;
    if (
        typeof error.message === 'string' &&
        (/(?:^|Google rejected the BigQuery credentials \()invalid_grant\b|^\s*(?:16[ :]+)?UNAUTHENTICATED\b|^invalid JWT signature\b/i.test(
            error.message,
        ) ||
            /^(?:The )?(?:service[ -])?account (?:has been |was |is )?(?:disabled|deleted)\b/i.test(
                error.message,
            ))
    )
        return true;
    if (
        error instanceof WarehouseConnectionError &&
        /\binvalid JWT signature\b/i.test(error.message)
    )
        return true;
    return (
        ['cause', 'response', 'data', 'error'].some((key) =>
            isBigqueryServiceAccountAuthError(error[key], nextAncestors),
        ) ||
        (Array.isArray(error.errors) &&
            error.errors.some((entry) =>
                isBigqueryServiceAccountAuthError(entry, nextAncestors),
            ))
    );
};

export const isDatabricksServiceAccountAuthError = (
    error: unknown,
    ancestors = new Set<unknown>(),
): boolean => {
    if (!isRecord(error) || ancestors.has(error)) return false;
    const nextAncestors = new Set(ancestors).add(error);
    if (
        error.statusCode === 401 ||
        error.status === 401 ||
        error.error === 'invalid_client' ||
        error.error === 'invalid_grant' ||
        error.error_code === 'UNAUTHENTICATED'
    )
        return true;
    if (
        (error instanceof WarehouseConnectionError ||
            error instanceof WarehouseQueryError) &&
        /^Received a response with a bad HTTP status code: 401$/.test(
            error.message,
        )
    )
        return true;
    return ['cause', 'response', 'data', 'error'].some((key) =>
        isDatabricksServiceAccountAuthError(error[key], nextAncestors),
    );
};

const snowflakeKeyAuthCodes = new Set([
    '390100',
    '390144',
    '394300',
    '394301',
    '394302',
    '394303',
    '394304',
    '394305',
    '394306',
    '394307',
    '404026',
    '404027',
    '404028',
]);

export const isSnowflakeServiceAccountAuthError = (
    error: unknown,
    ancestors = new Set<unknown>(),
): boolean => {
    if (!isRecord(error) || ancestors.has(error)) return false;
    ancestors.add(error);
    return (
        snowflakeKeyAuthCodes.has(String(error.code)) ||
        isSnowflakeServiceAccountAuthError(error.cause, ancestors)
    );
};

const athenaAuthCodes = new Set([
    'InvalidClientTokenId',
    'UnrecognizedClientException',
    'InvalidSignatureException',
    'SignatureDoesNotMatch',
    'ExpiredToken',
    'ExpiredTokenException',
    'CredentialsProviderError',
    'MissingCredentialsError',
    'CredentialsError',
    'MissingAuthenticationToken',
    'MissingAuthenticationTokenException',
]);

const awsErrors = (
    error: unknown,
    ancestors = new Set<unknown>(),
): Record<string, unknown>[] => {
    if (!isRecord(error) || ancestors.has(error)) return [];
    ancestors.add(error);
    return [
        error,
        ...['cause', 'response', 'data', 'error'].flatMap((key) =>
            awsErrors(error[key], ancestors),
        ),
    ];
};

const awsErrorCodes = (error: Record<string, unknown>): string[] => {
    const codes = [error.name, error.code]
        .filter((value): value is string => typeof value === 'string')
        .filter(
            (value) =>
                ![
                    'Error',
                    'WarehouseConnectionError',
                    'WarehouseQueryError',
                ].includes(value),
        );
    if (codes.length > 0) return codes;
    const wrappedCode =
        typeof error.message === 'string'
            ? error.message.match(/^\[([A-Za-z]+)(?: \d{3})?\](?: |$)/)?.[1]
            : undefined;
    return wrappedCode ? [wrappedCode] : [];
};

export const isAthenaServiceAccountAuthError = (error: unknown): boolean =>
    awsErrors(error).some((entry) =>
        awsErrorCodes(entry).some((code) => athenaAuthCodes.has(code)),
    );

export const getAthenaServiceAccountTestErrorMessage = (
    error: unknown,
): string => {
    const errors = awsErrors(error);
    const codes = errors.flatMap(awsErrorCodes);
    const message = errors
        .map((entry) =>
            typeof entry.message === 'string' ? entry.message : '',
        )
        .join(' ');
    const accessDenied =
        codes.some((code) =>
            ['AccessDenied', 'AccessDeniedException', 'Forbidden'].includes(
                code,
            ),
        ) ||
        errors.some(
            (entry) =>
                entry.statusCode === 403 ||
                entry.status === 403 ||
                (isRecord(entry.$metadata) &&
                    entry.$metadata.httpStatusCode === 403),
        ) ||
        /\baccess\s*denied\b|\[(?:[A-Za-z]+ )?403\]/i.test(message);
    if (isAthenaServiceAccountAuthError(error))
        return 'AWS rejected these access keys. Check the key pair and session token, or replace expired credentials.';
    if (
        (accessDenied &&
            /\b(?:results?|output)\s+(?:s3|bucket|location|directory)\b/i.test(
                message,
            )) ||
        /unable to verify\/create output bucket|(?:results?|output)(?:\s+(?:s3|bucket|location|directory)){1,3}.*(?:access.?denied|permission|verif)|(?:access.?denied|permission).*?(?:results?|output)\s+(?:bucket|location|directory)/i.test(
            message,
        )
    )
        return 'Check the AI results location and its S3 permissions. Check KMS permissions if it is encrypted.';
    if (
        codes.includes('InvalidRequestException') &&
        /work\s*group.*(?:not found|does not exist|disabled|not enabled)|(?:not found|does not exist|disabled|not enabled).*work\s*group/i.test(
            message,
        )
    )
        return "Check that the AI workgroup exists, is enabled and uses the connection's AWS region.";
    if (accessDenied)
        return "AWS denied access. Check the AI account's Athena, S3 and Lake Formation permissions.";
    if (
        codes.some((code) =>
            [
                'Throttling',
                'ThrottlingException',
                'TooManyRequestsException',
                'InternalServerException',
                'InternalFailure',
                'ServiceUnavailable',
                'ServiceUnavailableException',
                'TimeoutError',
                'NetworkingError',
                'ECONNRESET',
                'ENOTFOUND',
                'ETIMEDOUT',
                'EAI_AGAIN',
            ].includes(code),
        )
    )
        return 'AWS could not complete the connection check. Try again.';
    return 'Could not verify the shared agent account. Check the credentials and connection settings.';
};

const pgErrors = (
    error: unknown,
    ancestors = new Set<unknown>(),
): Record<string, unknown>[] => {
    if (!isRecord(error) || ancestors.has(error)) return [];
    ancestors.add(error);
    return [error, ...pgErrors(error.cause, ancestors)];
};

const postgresCredentialRejected =
    /^(?:password authentication failed for user "[^"\n]*"|role "[^"\n]*" does not exist)\s*$/i;
const postgresLoginDisabled = /^role "[^"\n]*" is not permitted to log in\s*$/i;
const postgresNetworkBlocked = /^no pg_hba.conf entry for host /i;
const postgresDatabaseDenied = /^permission denied for database "[^"\n]*"\s*$/i;

const pgAuthCodeResult = (
    errors: Record<string, unknown>[],
): boolean | null => {
    const codes = errors
        .map((entry) => entry.code)
        .filter(
            (code): code is string =>
                typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code),
        );
    return codes.length > 0
        ? codes.some((code) => code === '28P01' || code === '28000')
        : null;
};

export const isPostgresServiceAccountAuthError = (error: unknown): boolean => {
    const errors = pgErrors(error);
    const codeResult = pgAuthCodeResult(errors);
    if (codeResult !== null) return codeResult;
    return errors.some(
        (entry) =>
            typeof entry.message === 'string' &&
            (postgresCredentialRejected.test(entry.message) ||
                postgresLoginDisabled.test(entry.message) ||
                postgresNetworkBlocked.test(entry.message)),
    );
};

export const getPostgresServiceAccountTestErrorMessage = (
    error: unknown,
): string => {
    const errors = pgErrors(error);
    const matches = (pattern: RegExp) =>
        errors.some(
            (entry) =>
                typeof entry.message === 'string' &&
                pattern.test(entry.message),
        );
    if (matches(postgresLoginDisabled))
        return 'The Postgres shared agent account cannot log in. Add LOGIN to the role.';
    if (matches(postgresNetworkBlocked))
        return 'Postgres network rules (pg_hba.conf) block this user. Allow the shared agent account to connect.';
    if (isPostgresServiceAccountAuthError(error))
        return 'Postgres rejected the shared agent account credentials. Check the user and password.';
    if (matches(postgresDatabaseDenied))
        return 'The Postgres shared agent account lacks CONNECT on the database. Grant CONNECT to the role.';
    if (errors.some((entry) => entry.code === '3D000'))
        return 'The Postgres database does not exist. Check the connection database.';
    return 'Could not verify the shared agent account. Check the credentials and connection settings.';
};

const redshiftCredentialRejected =
    /^(?:password authentication failed for user "[^"\n]*"|(?:role|user) "[^"\n]*" does not exist)\s*$/i;

export const isRedshiftServiceAccountAuthError = (error: unknown): boolean => {
    const errors = pgErrors(error);
    const codeResult = pgAuthCodeResult(errors);
    if (codeResult !== null) return codeResult;
    return errors.some(
        (entry) =>
            typeof entry.message === 'string' &&
            redshiftCredentialRejected.test(entry.message),
    );
};

export const getRedshiftServiceAccountTestErrorMessage = (
    error: unknown,
): string => {
    const errors = pgErrors(error);
    if (isRedshiftServiceAccountAuthError(error))
        return 'Redshift rejected the shared agent account credentials. Check the user and password.';
    if (errors.some((entry) => entry.code === '3D000'))
        return 'The Redshift database does not exist. Check the connection database.';
    if (
        errors.some(
            (entry) =>
                entry.code === '42501' ||
                (typeof entry.message === 'string' &&
                    /^permission denied\b/i.test(entry.message)),
        )
    )
        return 'The Redshift shared agent account lacks access. Ask an admin to check its grants.';
    return 'Could not verify the shared agent account. Check the credentials and connection settings.';
};

export const isTrinoServiceAccountAuthError = (
    error: unknown,
    ancestors = new Set<unknown>(),
): boolean => {
    if (!isRecord(error) || ancestors.has(error)) return false;
    ancestors.add(error);
    return (
        error.status === 401 ||
        isTrinoServiceAccountAuthError(error.cause, ancestors) ||
        isTrinoServiceAccountAuthError(error.response, ancestors)
    );
};

export const getTrinoServiceAccountTestErrorMessage = (
    error: unknown,
): string => {
    if (isTrinoServiceAccountAuthError(error))
        return 'Trino rejected the shared agent account credentials. Check the user and password.';
    if (
        pgErrors(error).some((entry) => entry.errorName === 'PERMISSION_DENIED')
    )
        return 'The Trino shared agent account lacks access. Ask an admin to check its access control rules.';
    return 'Could not verify the shared agent account. Check the credentials and connection settings.';
};

const clickhouseAuthCodes = new Set(['516', '192', '193', '194']);
const clickhouseAuthTypes = new Set([
    'AUTHENTICATION_FAILED',
    'UNKNOWN_USER',
    'WRONG_PASSWORD',
    'REQUIRED_PASSWORD',
]);

const clickhouseErrors = (
    error: unknown,
    ancestors = new Set<unknown>(),
): Record<string, unknown>[] => {
    if (!isRecord(error) || ancestors.has(error)) return [];
    ancestors.add(error);
    return [error, ...clickhouseErrors(error.cause, ancestors)];
};

const clickhouseErrorCode = (error: Record<string, unknown>): string | null => {
    if (typeof error.code === 'number' || typeof error.code === 'string')
        return String(error.code);
    return typeof error.message === 'string'
        ? (error.message.match(
              /^\s*Code: (\d+)\.\s*(?:DB::Exception:|$)/,
          )?.[1] ?? null)
        : null;
};

export const isClickhouseServiceAccountAuthError = (error: unknown): boolean =>
    clickhouseErrors(error).some((entry) => {
        const code = clickhouseErrorCode(entry);
        return code !== null
            ? clickhouseAuthCodes.has(code)
            : typeof entry.type === 'string' &&
                  clickhouseAuthTypes.has(entry.type);
    });

export const getClickhouseServiceAccountTestErrorMessage = (
    error: unknown,
): string => {
    const errors = clickhouseErrors(error);
    if (isClickhouseServiceAccountAuthError(error))
        return 'ClickHouse rejected this user or password. Check the credentials or replace them.';
    if (
        errors.some(
            (entry) =>
                clickhouseErrorCode(entry) === '164' ||
                entry.type === 'READONLY',
        )
    )
        return 'ClickHouse blocked the query settings. Use readonly = 2, or allow the required settings in the read-only profile.';
    if (
        errors.some(
            (entry) =>
                clickhouseErrorCode(entry) === '497' ||
                entry.type === 'ACCESS_DENIED',
        )
    )
        return "ClickHouse denied access. Check the AI account's SELECT grants and connection database.";
    return 'Could not verify the shared agent account. Check the credentials and connection settings.';
};

export const getUserPasswordServiceAccountTestErrorMessage = (
    type:
        | WarehouseTypes.POSTGRES
        | WarehouseTypes.REDSHIFT
        | WarehouseTypes.TRINO
        | WarehouseTypes.CLICKHOUSE,
    error: unknown,
): string => {
    switch (type) {
        case WarehouseTypes.TRINO:
            return getTrinoServiceAccountTestErrorMessage(error);
        case WarehouseTypes.CLICKHOUSE:
            return getClickhouseServiceAccountTestErrorMessage(error);
        case WarehouseTypes.POSTGRES:
            return getPostgresServiceAccountTestErrorMessage(error);
        case WarehouseTypes.REDSHIFT:
            return getRedshiftServiceAccountTestErrorMessage(error);
        default:
            return assertUnreachable(type, 'Unknown warehouse type');
    }
};
