import {
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import {
    getAthenaServiceAccountTestErrorMessage,
    isAthenaServiceAccountAuthError,
    isBigqueryServiceAccountAuthError,
    isDatabricksServiceAccountAuthError,
    isSnowflakeServiceAccountAuthError,
} from './aiServiceAccountErrors';

describe('BigQuery AI service account authentication errors', () => {
    test.each([
        new Error('invalid_grant'),
        new WarehouseConnectionError(
            'Google rejected the BigQuery credentials (invalid_grant: Invalid JWT Signature.)',
        ),
        new Error('Invalid JWT signature.'),
        new WarehouseConnectionError(
            'Failed connection to warehouse. Invalid JWT Signature.',
        ),
        new Error('Service account is disabled'),
        new Error('Account has been deleted'),
        { code: 401 },
        { status: 401 },
        { statusCode: 401 },
        { code: 'UNAUTHENTICATED' },
        { response: { status: 401 } },
        { response: { status: 400, data: { error: 'invalid_grant' } } },
        { cause: { errors: [{ message: 'UNAUTHENTICATED' }] } },
    ])('recognizes authentication rejection %j', (error) => {
        expect(isBigqueryServiceAccountAuthError(error)).toBe(true);
    });

    test.each([
        new Error('Access Denied: dataset: Permission denied'),
        {
            code: 403,
            errors: [
                {
                    reason: 'accessDenied',
                    message: 'Permission denied on dataset',
                },
            ],
        },
        new Error('ECONNRESET'),
        new Error('Syntax error: unexpected token'),
        new WarehouseQueryError(
            'Syntax error: Unexpected identifier invalid JWT signature',
        ),
        new Error('Syntax error: Unexpected identifier invalid_grant'),
        new Error('Unrecognized name: UNAUTHENTICATED at [1:3]'),
        {
            reason: 'invalidQuery',
            message: 'Syntax error near invalid JWT signature',
        },
        { response: { status: 503 } },
        { response: { status: 400, data: { error: 'invalid_request' } } },
        new Error('Account does not have permission to query this dataset'),
        null,
        'invalid_grant',
    ])('leaves non-authentication failures unchanged %j', (error) => {
        expect(isBigqueryServiceAccountAuthError(error)).toBe(false);
    });

    test('handles cyclic causes', () => {
        const error = Object.assign(new Error('network error'), { cause: {} });
        error.cause = error;
        expect(isBigqueryServiceAccountAuthError(error)).toBe(false);
    });
});

describe('Databricks AI service account authentication errors', () => {
    test.each([
        { statusCode: 401 },
        { response: { status: 401 } },
        { response: { status: 400, data: { error: 'invalid_client' } } },
        { cause: { error_code: 'UNAUTHENTICATED' } },
        new WarehouseConnectionError(
            'Received a response with a bad HTTP status code: 401',
        ),
        new WarehouseQueryError(
            'Received a response with a bad HTTP status code: 401',
        ),
    ])('recognizes token or session authentication rejection %j', (error) => {
        expect(isDatabricksServiceAccountAuthError(error)).toBe(true);
    });
    test.each([
        { statusCode: 403 },
        { error_code: 'PERMISSION_DENIED' },
        new WarehouseConnectionError(
            'Received a response with a bad HTTP status code: 403',
        ),
        new WarehouseQueryError('Syntax error near token'),
        new Error('Invalid access token in SQL'),
        new Error('ECONNRESET'),
        { response: { status: 503 } },
        { error_code: 'WAREHOUSE_NOT_RUNNING' },
        null,
    ])(
        'preserves permission, query, compute and network failures %j',
        (error) => {
            expect(isDatabricksServiceAccountAuthError(error)).toBe(false);
        },
    );
    test('handles cyclic causes', () => {
        const error = { cause: {} };
        error.cause = error;
        expect(isDatabricksServiceAccountAuthError(error)).toBe(false);
    });
});

describe('Snowflake key authentication errors', () => {
    it.each(['390100', '390144', '394304', '394306', 404026, 404028])(
        'recognizes code %s through the warehouse wrapper',
        (code) => {
            const wrapper = new WarehouseConnectionError('Snowflake error');
            wrapper.cause = Object.assign(new Error('sign-in failed'), {
                code,
            });
            expect(isSnowflakeServiceAccountAuthError(wrapper)).toBe(true);
        },
    );
    it.each([
        { code: '001003' },
        { code: '002003' },
        { code: 'ECONNRESET' },
        { code: 'ETIMEDOUT' },
        new WarehouseConnectionError('Snowflake error'),
        { code: '390999' },
    ])(
        'does not misclassify SQL, ACL, transport, or unrecognized errors %j',
        (cause) => {
            expect(isSnowflakeServiceAccountAuthError({ cause })).toBe(false);
        },
    );
    it('handles cyclic causes', () => {
        const error = new Error('cycle');
        error.cause = error;
        expect(isSnowflakeServiceAccountAuthError(error)).toBe(false);
    });
});

describe('Athena authentication failures', () => {
    it.each([
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
    ])('recognizes precise %s codes and wrapped SDK errors', (name) => {
        for (const error of [
            { name },
            { code: name },
            { cause: { name } },
            new WarehouseQueryError(`[${name} 403] denied`),
            new WarehouseConnectionError(`[${name}] denied`),
        ]) {
            expect(isAthenaServiceAccountAuthError(error)).toBe(true);
            expect(getAthenaServiceAccountTestErrorMessage(error)).toContain(
                'AWS rejected these access keys',
            );
        }
    });
    it.each([
        { name: 'AccessDenied' },
        { name: 'AccessDeniedException' },
        { name: 'Forbidden' },
        { statusCode: 403 },
        { $metadata: { httpStatusCode: 403 } },
        new WarehouseQueryError('[AccessDeniedException 403] denied'),
        { name: 'InvalidRequestException', message: 'workgroup not found' },
        { name: 'ThrottlingException' },
        { message: 'table ExpiredToken does not exist' },
        { message: '[ExpiredTokenSuffix 403] denied' },
    ])('does not invalidate keys for %j', (error) => {
        expect(isAthenaServiceAccountAuthError(error)).toBe(false);
    });
    it.each([
        "INVALID_CAST_ARGUMENT: Cannot cast '[ExpiredToken]' to INT",
        "[InvalidRequestException 400] Invalid query: Cannot cast '[ExpiredToken]' to INT",
    ])('preserves query failures containing bracketed codes: %s', (message) => {
        const error = new WarehouseQueryError(message);
        expect(isAthenaServiceAccountAuthError(error)).toBe(false);
        expect(getAthenaServiceAccountTestErrorMessage(error)).toBe(
            'Could not verify the AI service account. Check the credentials and connection settings.',
        );
    });
    it.each([
        { name: 'InvalidRequestException' },
        { code: 'InvalidRequestException' },
    ])('prefers structured codes over message tags: %j', (code) => {
        const error = {
            ...code,
            message: '[ExpiredToken 403] is not an SDK tag here',
        };
        expect(isAthenaServiceAccountAuthError(error)).toBe(false);
        expect(getAthenaServiceAccountTestErrorMessage(error)).not.toContain(
            'AWS rejected these access keys',
        );
    });
    it.each([
        [{ name: 'AccessDeniedException' }, 'AWS denied access'],
        [{ statusCode: 403 }, 'AWS denied access'],
        [
            {
                name: 'InvalidRequestException',
                message: 'Workgroup agents does not exist',
            },
            'AI workgroup',
        ],
        [
            {
                name: 'InvalidRequestException',
                message: 'WorkGroup is disabled',
            },
            'AI workgroup',
        ],
        [
            {
                name: 'InvalidRequestException',
                message: 'Unable to verify/create output bucket',
            },
            'AI results location',
        ],
        [
            {
                name: 'AccessDeniedException',
                message: 'Access denied to output location',
            },
            'AI results location',
        ],
        [{ name: 'ThrottlingException' }, 'Try again'],
        [{ code: 'ECONNRESET' }, 'Try again'],
        [{ name: 'InternalServerException' }, 'Try again'],
        [
            { name: 'InvalidRequestException', message: 'Invalid SQL' },
            'Could not verify',
        ],
    ])('returns safe actionable copy for %j', (error, message) => {
        expect(getAthenaServiceAccountTestErrorMessage(error)).toContain(
            message,
        );
    });
    it('uses a permission code with results-location context', () => {
        expect(
            getAthenaServiceAccountTestErrorMessage({
                name: 'AccessDeniedException',
                message: 'S3 output location s3://results/',
            }),
        ).toContain('AI results location');
    });
    it('handles cyclic causes', () => {
        const error: { cause?: unknown; name: string } = { name: 'Unknown' };
        error.cause = error;
        expect(isAthenaServiceAccountAuthError(error)).toBe(false);
        expect(getAthenaServiceAccountTestErrorMessage(error)).toContain(
            'Could not verify',
        );
    });
});
