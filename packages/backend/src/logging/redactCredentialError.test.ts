import { redactCredentialError } from './redactCredentialError';

describe('redactCredentialError', () => {
    test.each([
        ['password is abc123', 'abc123'],
        ['private key is YWJjMTIz', 'YWJjMTIz'],
        ['response "sensitive-row', 'sensitive-row'],
        ["response 'sensitive-row", 'sensitive-row'],
        ['response `sensitive-row', 'sensitive-row'],
        ['response [sensitive-row', 'sensitive-row'],
        ['response {sensitive-row', 'sensitive-row'],
        ['response "payload\nprivate words', 'private words'],
        ['password\nis\nabc123', 'abc123'],
        ['response [payload\nprivate words', 'private words'],
        ['request https://ab12345.eu-west-1.snowflakecomputing.com', 'ab12345'],
        ['invalid_grant: refresh token "rt-short" was rejected', 'rt-short'],
        ['supplied key "pk-short" was rejected', 'pk-short'],
        ['response ["sensitive-row", 123]', 'sensitive-row'],
        ['JWT eyJx.e30.sig rejected', 'eyJx.e30.sig'],
        [
            'request https://name:pass@example.test/token?foo=short#fragment',
            'short',
        ],
        ['request https://name:pass@example.test/token?foo=short', 'name:pass'],
        ['value "short" rejected', 'short'],
        ["value 'short' rejected", 'short'],
        ['value `short` rejected', 'short'],
        ['refresh token rt-short rejected', 'rt-short'],
        ['client email client-short rejected', 'client-short'],
        ['assertion: short rejected', 'short'],
        ['authorization: Bearer tiny', 'tiny'],
        ['authorization=Basic tiny', 'tiny'],
        ['value "sensitive SELECT * FROM records" rejected', 'sensitive'],
        ['response [123, {"nested": [456]}]', '456'],
        ['response {"nested": [123]}', '123'],
        ['request http://host/path?a=tiny', 'tiny'],
        ['request https://u:p@host/path', 'u:p'],
    ])('redacts sensitive content in %s', (message, secret) => {
        expect(
            redactCredentialError(new Error(message)).errorMessage,
        ).not.toContain(secret);
    });

    test.each([
        'Invalid JWT issued with clock skew',
        'Permission denied on project',
        "can't connect to the warehouse",
        "doesn't connect to the warehouse",
    ])('preserves non-SQL diagnostics: %s', (message) => {
        expect(redactCredentialError(new Error(message)).errorMessage).toBe(
            message,
        );
    });

    test.each([
        'SELECT CURRENT_USER',
        'SELECT secret_column',
        'SHOW USERS',
        'select a from t',
        'SELECT secret FROM records',
        'SELECT *',
        'SELECT SESSION_USER() AS principal',
        'SELECT 1',
        'SELECT "secret", other',
        'WITH "secret" AS (SELECT 1)',
        'SELECT secret, other',
        'WITH secret AS (SELECT 1)',
        'INSERT INTO secret VALUES (1)',
        'UPDATE secret SET value = 1',
        'DELETE FROM secret',
        'MERGE INTO secret USING source',
        'CREATE OR REPLACE TABLE secret (id INT)',
        'ALTER VIEW secret AS SELECT 1',
        'DROP SCHEMA secret',
        'CALL secret()',
        'GRANT SELECT ON secret TO someone',
        'COPY INTO secret',
        'TRUNCATE TABLE secret',
    ])('redacts SQL statements: %s', (sql) => {
        expect(
            redactCredentialError(new Error(`failed: ${sql}`)).errorMessage,
        ).toBe('failed: [REDACTED SQL]');
    });

    test.each([
        ['invalid_grant refresh_token=refresh-secret', 'refresh-secret'],
        ['invalid_grant accessToken: "access secret"', 'access secret'],
        ['invalid_grant private_key="saved-key"', 'saved-key'],
        [
            'invalid_grant -----BEGIN PRIVATE KEY-----\npem-secret\n-----END PRIVATE KEY-----',
            'pem-secret',
        ],
        [
            'invalid_grant -----BEGIN PRIVATE KEY-----\\npem-secret\\n-----END PRIVATE KEY-----',
            'pem-secret',
        ],
        ['invalid_grant agent@example.com', 'agent@example.com'],
        [
            'invalid_grant {"private_key":"saved-key","client_email":"agent@example.com"}',
            'saved-key',
        ],
        [
            'invalid_grant SELECT secret_column FROM sensitive_table',
            'secret_column',
        ],
        ['invalid_grant WITH private_rows AS (SELECT 1)', 'private_rows'],
        ['invalid_grant Bearer short-secret', 'short-secret'],
        [
            'invalid_grant eyJhbGciOiJIUzI1NiJ9.eyJzZWNyZXQiOiJ2YWx1ZSJ9.signature',
            'eyJhbGciOiJIUzI1NiJ9',
        ],
    ])('preserves the error category and redacts %s', (message, secret) => {
        const result = redactCredentialError(new TypeError(message));
        expect(result.errorClass).toBe('TypeError');
        expect(result.errorCategory).toBe('invalid_grant');
        expect(result.errorMessage).not.toContain('invalid_grant');
        expect(JSON.stringify(result)).not.toContain(secret);
    });

    test('does not serialize SDK request bodies, causes or custom error names', () => {
        const error = Object.assign(new Error('Connection refused'), {
            name: 'secret@example.com',
            request: { token: 'request-secret' },
            cause: new Error('cause-secret'),
        });
        expect(redactCredentialError(error)).toEqual({
            errorClass: 'Error',
            errorCode: null,
            errorCategory: null,
            errorMessage: 'Connection refused',
        });
    });
});

test.each([
    [
        'Unable to call token endpoint: ECONNREFUSED',
        'Unable to call token [REDACTED]',
    ],
    ['refresh token has expired', 'refresh token [REDACTED]'],
    ['password is abc123', 'password [REDACTED]'],
    ['private key is YWJjMTIz', 'private key [REDACTED]'],
    ['HTTP status 403', 'HTTP status 403'],
    ['(Permission) denied.', '(Permission) denied.'],
    [
        'mixedCase CURRENT_USER secret_column id-123 12345 /path/to/file',
        '[REDACTED]',
    ],
    ['private_key=value', '[REDACTED]'],
])('filters tokens in diagnostic %s', (message, expected) => {
    expect(redactCredentialError(message).errorMessage).toBe(expected);
});

test.each<unknown>([
    { message: ['sensitive-row', 123] },
    {
        message: {
            toString: () => {
                throw new Error('must not stringify');
            },
        },
    },
    {
        toString: () => {
            throw new Error('must not stringify');
        },
    },
    null,
    undefined,
    123,
])('fails closed for non-string messages %#', (error) => {
    expect(redactCredentialError(error)).toEqual({
        errorClass: 'Error',
        errorCode: null,
        errorCategory: null,
        errorMessage: '[REDACTED]',
    });
});

test.each(['message', 'code', 'sqlState', 'name'])(
    'never throws when reading %s fails',
    (property) => {
        const error = Object.defineProperty(
            new Error('Connection failed'),
            property,
            {
                get: () => {
                    throw new Error('sensitive getter failure');
                },
            },
        );
        expect(redactCredentialError(error)).toEqual({
            errorClass: 'Error',
            errorCode: null,
            errorCategory: null,
            errorMessage: '[REDACTED]',
        });
    },
);

test('never throws for a revoked proxy', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(redactCredentialError(proxy)).toEqual({
        errorClass: 'Error',
        errorCode: null,
        errorCategory: null,
        errorMessage: '[REDACTED]',
    });
});

test.each([
    [{ code: '390318' }, '390318'],
    [{ code: 390318 }, '390318'],
    [{ code: 'ECONNREFUSED' }, 'ECONNREFUSED'],
    [{ sqlState: '08001' }, '08001'],
    [{ code: null, sqlState: '08001' }, '08001'],
    [{ code: 'ECONNREFUSED', sqlState: '08001' }, 'ECONNREFUSED'],
    [{ code: 'user@example.com' }, null],
    [{ code: 'value with spaces' }, null],
    [{ code: 'x'.repeat(41) }, null],
    [{ code: '' }, null],
    [
        {
            code: {
                toString: () => {
                    throw new Error('must not stringify');
                },
            },
        },
        null,
    ],
])('validates error codes %#', (details, expected) => {
    expect(
        redactCredentialError({ ...details, message: 'Connection failed' })
            .errorCode,
    ).toBe(expected);
});

test('truncates before processing the message', () => {
    expect(
        redactCredentialError(`${'a'.repeat(1000)} must disappear`)
            .errorMessage,
    ).toBe('[REDACTED]');
});

test.each(['[', 'a', 'SELECT '])(
    'bounds processing of a large %s payload',
    (pattern) => {
        const message = pattern
            .repeat(Math.ceil(200000 / pattern.length))
            .slice(0, 200000);
        const start = performance.now();
        const result = redactCredentialError(message);
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(50);
        expect(result.errorMessage).toBe(
            pattern === 'SELECT ' ? '[REDACTED SQL]' : '[REDACTED]',
        );
    },
);

test('does not coerce message or code objects', () => {
    const toString = vi.fn(() => {
        throw new Error('must not stringify');
    });
    expect(
        redactCredentialError({ message: { toString }, code: { toString } }),
    ).toEqual({
        errorClass: 'Error',
        errorCode: null,
        errorCategory: null,
        errorMessage: '[REDACTED]',
    });
    expect(toString).not.toHaveBeenCalled();
});

test('redacts an unterminated PEM block through the end of the message', () => {
    expect(
        redactCredentialError(
            'failed -----BEGIN PRIVATE KEY-----\nprivate material',
        ).errorMessage,
    ).toBe('failed [REDACTED]');
});

test.each([
    'response [[123], 456, 789]',
    'response {{123}, 456, 789}',
    'response [{nested: [123]}, 456, 789] trailing payload',
    'response {nested: {value: 123}} 456 789',
    'response [123]\n456\n789',
])('redacts the entire nested payload %#', (message) => {
    expect(redactCredentialError(message).errorMessage).toBe(
        'response [REDACTED]',
    );
});

test.each([
    ['passphrase HUNTER', 'passphrase [REDACTED]'],
    ['refresh_token HUNTER', '[REDACTED]'],
    ['api_key banana', '[REDACTED]'],
    ['apikey', 'apikey [REDACTED]'],
    ['clientsecret', 'clientsecret [REDACTED]'],
    ['pat', 'pat [REDACTED]'],
    ['pin', 'pin [REDACTED]'],
    ['otp', 'otp [REDACTED]'],
    ['apikey banana', 'apikey [REDACTED]'],
    ['clientsecret banana', 'clientsecret [REDACTED]'],
    ['pat HUNTER', 'pat [REDACTED]'],
    ['pin HUNTER', 'pin [REDACTED]'],
    ['otp HUNTER', 'otp [REDACTED]'],
    ['client-secret banana', '[REDACTED]'],
    ['refresh.token HUNTER', '[REDACTED]'],
    ['ｐａｓｓｗｏｒｄ HUNTER', '[REDACTED]'],
    ['ａｐｉ＿ｋｅｙ banana', '[REDACTED]'],
    ['ｐｉｎ HUNTER', '[REDACTED]'],
    ['épassword HUNTER', '[REDACTED]'],
    ['café failed', '[REDACTED] failed'],
    ['monkey failed', 'monkey failed'],
])(
    'cuts credential variants and rejects unsafe tokens %#',
    (message, expected) => {
        expect(redactCredentialError(message).errorMessage).toBe(expected);
    },
);

test.each([
    ['invalid_grant', 'invalid_grant'],
    ['INVALID_GRANT token expired', 'invalid_grant'],
    ['invalid_client invalid_grant', 'invalid_grant'],
    ['INVALID_CLIENT token expired', 'invalid_client'],
    ['OAuth access token expired', 'token_expired'],
    ['Expired JWT', 'token_expired'],
    ['session has expired', 'token_expired'],
    ['Incorrect username or password was specified.', 'authentication_failed'],
    ['Authentication failed', 'authentication_failed'],
    ['Unauthorised', 'authentication_failed'],
    ['Unauthorized', 'authentication_failed'],
    ['HTTP 401', 'authentication_failed'],
    [
        'Access Denied: Project my-project-123: User does not have bigquery.jobs.create permission in project my-project-123.',
        'permission_denied',
    ],
    ['User does not have bigquery.jobs.create permission', 'permission_denied'],
    ['Permission denied', 'permission_denied'],
    ['Forbidden', 'permission_denied'],
    ['HTTP 403', 'permission_denied'],
    ['Insufficient privileges', 'permission_denied'],
    ['Resource not found', 'not_found'],
    ['Resource does not exist', 'not_found'],
    ['HTTP 404', 'not_found'],
    ['Unable to call token endpoint: ECONNREFUSED', 'network'],
    ['econnreset', 'network'],
    ['ETIMEDOUT', 'network'],
    ['ENOTFOUND', 'network'],
    ['EAI_AGAIN', 'network'],
    ['Socket hang up', 'network'],
    ['Request timed out', 'timeout'],
    ['Timeout', 'timeout'],
    ['Invalid JWT issued with clock skew', null],
    ['token\nexpired', null],
    [`token ${'a'.repeat(41)} expired`, null],
    ['value_invalid_grant_suffix', null],
    ['HTTP 4010', null],
    [`${'a'.repeat(1000)} invalid_grant`, null],
])('classifies the raw bounded message %#', (message, expected) => {
    expect(redactCredentialError(message).errorCategory).toBe(expected);
});
