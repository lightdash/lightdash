import {
    WarehouseConnectionError,
    WarehouseQueryError,
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
    return 'Could not verify the AI service account. Check the credentials and connection settings.';
};
