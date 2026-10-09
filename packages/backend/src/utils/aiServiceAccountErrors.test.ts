import {
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import {
    isBigqueryServiceAccountAuthError,
    isDatabricksServiceAccountAuthError,
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
        new WarehouseQueryError(
            'Received a response with a bad HTTP status code: 401',
        ),
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
