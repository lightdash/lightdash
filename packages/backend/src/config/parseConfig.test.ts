import {
    ALL_TASK_NAMES,
    LightdashMode,
    OrganizationMemberRole,
    ParameterError,
    ParseError,
    SentryConfig,
} from '@lightdash/common';
import { VERSION } from '../version';
import {
    getFloatArrayFromEnvironmentVariable,
    getFloatFromEnvironmentVariable,
    getIntegerFromEnvironmentVariable,
    getMaybeBase64EncodedFromEnvironmentVariable,
    getObjectFromEnvironmentVariable,
    parseConfig,
    parseOrganizationMemberRoleArray,
} from './parseConfig';

jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    writeFile: jest.fn(),
}));

beforeEach(() => {
    process.env = {
        LIGHTDASH_SECRET: 'not very secret',
        S3_ENDPOINT: 'mock_endpoint',
        S3_BUCKET: 'mock_bucket',
        S3_REGION: 'mock_region',
    };
});

test('Should default results S3 config to S3 config', () => {
    process.env.S3_ACCESS_KEY = 'mock_access_key';
    process.env.S3_SECRET_KEY = 'mock_secret_key';
    const config = parseConfig();
    expect(config.results.s3).toEqual({
        endpoint: 'mock_endpoint',
        bucket: 'mock_bucket',
        region: 'mock_region',
        accessKey: 'mock_access_key',
        secretKey: 'mock_secret_key',
        forcePathStyle: false,
    });
});

test('Should use explicit results S3 config when set', () => {
    process.env.RESULTS_S3_BUCKET = 'new_bucket';
    process.env.RESULTS_S3_REGION = 'new_region';
    process.env.RESULTS_S3_ACCESS_KEY = 'new_access_key';
    process.env.RESULTS_S3_SECRET_KEY = 'new_secret_key';
    const config = parseConfig();
    expect(config.results.s3).toEqual({
        endpoint: 'mock_endpoint',
        bucket: 'new_bucket',
        region: 'new_region',
        accessKey: 'new_access_key',
        secretKey: 'new_secret_key',
        forcePathStyle: false,
    });
});

test('Should prioritize new results S3 config over deprecated config when both are set', () => {
    // Set both new and deprecated environment variables
    process.env.RESULTS_S3_BUCKET = 'new_bucket';
    process.env.RESULTS_S3_REGION = 'new_region';
    process.env.RESULTS_S3_ACCESS_KEY = 'new_access_key';
    process.env.RESULTS_S3_SECRET_KEY = 'new_secret_key';
    process.env.RESULTS_CACHE_S3_BUCKET = 'deprecated_bucket';
    process.env.RESULTS_CACHE_S3_REGION = 'deprecated_region';
    process.env.RESULTS_CACHE_S3_ACCESS_KEY = 'deprecated_access_key';
    process.env.RESULTS_CACHE_S3_SECRET_KEY = 'deprecated_secret_key';

    const config = parseConfig();
    expect(config.results.s3).toEqual({
        endpoint: 'mock_endpoint',
        bucket: 'new_bucket',
        region: 'new_region',
        accessKey: 'new_access_key',
        secretKey: 'new_secret_key',
        forcePathStyle: false,
    });
});

test('Should parse rudder config from env', () => {
    const expected = {
        dataPlaneUrl: 'customurl',
        writeKey: 'customkey',
    };
    process.env.RUDDERSTACK_DATA_PLANE_URL = 'customurl';
    process.env.RUDDERSTACK_WRITE_KEY = 'customkey';
    expect(parseConfig().rudder).toEqual(expected);
});

test('Should use default sentry configuration if no environment vars', () => {
    const expected: SentryConfig = {
        backend: {
            dsn: '',
            securityReportUri: '',
        },
        frontend: {
            dsn: '',
        },
        release: VERSION,
        environment: LightdashMode.DEFAULT,
        tracesSampleRate: 0.1,
        profilesSampleRate: 0.2,
        anr: {
            enabled: false,
            captureStacktrace: false,
            timeout: undefined,
        },
    };
    expect(parseConfig().sentry).toStrictEqual(expected);
});

test('Should parse sentry config from env', () => {
    const expected: SentryConfig = {
        backend: {
            dsn: 'mydsnbackend.sentry.io',
            securityReportUri: '',
        },
        frontend: {
            dsn: 'mydsnfrontend.sentry.io',
        },
        release: VERSION,
        environment: 'development',
        tracesSampleRate: 0.8,
        profilesSampleRate: 1.0,
        anr: {
            enabled: true,
            captureStacktrace: true,
            timeout: 1000,
        },
    };
    process.env.SENTRY_BE_DSN = 'mydsnbackend.sentry.io';
    process.env.SENTRY_FE_DSN = 'mydsnfrontend.sentry.io';
    process.env.NODE_ENV = 'development';
    process.env.SENTRY_TRACES_SAMPLE_RATE = '0.8';
    process.env.SENTRY_PROFILES_SAMPLE_RATE = '1.0';
    process.env.SENTRY_ANR_ENABLED = 'true';
    process.env.SENTRY_ANR_CAPTURE_STACKTRACE = 'true';
    process.env.SENTRY_ANR_TIMEOUT = '1000';
    expect(parseConfig().sentry).toStrictEqual(expected);
});

test('Should throw error when secret missing', () => {
    delete process.env.LIGHTDASH_SECRET;
    expect(() => parseConfig()).toThrowError(ParseError);
});

test('Should include secret in output', () => {
    process.env.LIGHTDASH_SECRET = 'so very secret';
    expect(parseConfig().lightdashSecret).toEqual('so very secret');
});

test('Should parse valid integer', () => {
    process.env.MY_NUMBER = '100';
    expect(getIntegerFromEnvironmentVariable('MY_NUMBER')).toEqual(100);
});
test('Should parse non existent integer as undefined', () => {
    expect(getIntegerFromEnvironmentVariable('MY_NUMBER')).toEqual(undefined);
});
test('Should throw ParseError if not a valid integer', () => {
    process.env.MY_NUMBER = 'hello';
    expect(() => getIntegerFromEnvironmentVariable('MY_NUMBER')).toThrowError(
        ParseError,
    );
});
test('Should parse valid float', () => {
    process.env.MY_NUMBER = '0.5';
    expect(getFloatFromEnvironmentVariable('MY_NUMBER')).toEqual(0.5);
});
test('Should parse non existent float as undefined', () => {
    expect(getFloatFromEnvironmentVariable('MY_NUMBER')).toEqual(undefined);
});
test('Should throw ParseError if not a valid float', () => {
    process.env.MY_NUMBER = 'hello';
    expect(() => getFloatFromEnvironmentVariable('MY_NUMBER')).toThrowError(
        ParseError,
    );
});

describe('getMaybeBase64EncodedFromEnvironmentVariable', () => {
    const b64 = (value: string) =>
        Buffer.from(value, 'utf-8').toString('base64');

    test('returns undefined if given undefined as content', () => {
        expect(getMaybeBase64EncodedFromEnvironmentVariable(undefined)).toEqual(
            undefined,
        );
    });

    test('passes-through unchanged with default settings', () => {
        expect(
            getMaybeBase64EncodedFromEnvironmentVariable('Hey there'),
        ).toEqual('Hey there');
    });

    test('decodes base64 with a prefix with base64: prefix', () => {
        expect(
            getMaybeBase64EncodedFromEnvironmentVariable(
                `base64:${b64('Hey there')}`,
                {
                    decodeIfStartsWith: 'base64:',
                },
            ),
        ).toEqual('Hey there');
    });

    test('decodes base64 with a prefix with custom prefix', () => {
        expect(
            getMaybeBase64EncodedFromEnvironmentVariable(
                `DECODE-ME:${b64('Hello')}`,
                {
                    decodeIfStartsWith: 'DECODE-ME:',
                },
            ),
        ).toEqual('Hello');
    });

    test('does not decode base64 with custom prefix', () => {
        expect(
            getMaybeBase64EncodedFromEnvironmentVariable(
                `-----BEGIN CERTIFICATE-----\nPlease do not decode me`,
                {
                    decodeUnlessStartsWith: '-----BEGIN CERTIFICATE-----',
                },
            ),
        ).toEqual('-----BEGIN CERTIFICATE-----\nPlease do not decode me');
    });

    test('decodes base64 with custom negative prefix if not a match', () => {
        expect(
            getMaybeBase64EncodedFromEnvironmentVariable(b64('Hey there'), {
                decodeUnlessStartsWith: '-----BEGIN CERTIFICATE-----',
            }),
        ).toEqual('Hey there');
    });
});

describe('getFloatArrayFromEnvironmentVariable', () => {
    test('returns undefined if env var is not defined', () => {
        expect(getFloatArrayFromEnvironmentVariable('MISSING_ENV_VAR')).toEqual(
            undefined,
        );
    });
    test('returns array if env var value is valid', () => {
        process.env.VALID_NUMBER_ARRAY = '1,2.5,3.0';
        expect(
            getFloatArrayFromEnvironmentVariable('VALID_NUMBER_ARRAY'),
        ).toEqual([1, 2.5, 3]);
    });
    test('throw error if env var value is invalid', () => {
        process.env.INVALID_NUMBER_ARRAY = 'abc,1,2';
        expect(() =>
            getFloatArrayFromEnvironmentVariable('INVALID_NUMBER_ARRAY'),
        ).toThrowError(ParseError);
    });
});

describe('getObjectFromEnvironmentVariable', () => {
    test('returns undefined if env var is not defined', () => {
        expect(getObjectFromEnvironmentVariable('MISSING_ENV_VAR')).toEqual(
            undefined,
        );
    });
    test('returns object if env var value is valid', () => {
        process.env.VALID_OBJECT = '{"test":"value", "test2": 2}';
        expect(getObjectFromEnvironmentVariable('VALID_OBJECT')).toEqual({
            test: 'value',
            test2: 2,
        });
    });
    test('throw error if env var value is invalid', () => {
        process.env.INVALID_OBJECT = 'test="value"';
        expect(() =>
            getObjectFromEnvironmentVariable('INVALID_OBJECT'),
        ).toThrowError(ParseError);
    });
});

// test parseOrganizationMemberRoleArray
describe('parseOrganizationMemberRoleArray', () => {
    beforeEach(() => {
        // clear env var
        delete process.env.ORGANIZATION_MEMBER_ROLE_ARRAY;
    });
    test('Should parse non existent organization member role array as undefined', () => {
        expect(
            parseOrganizationMemberRoleArray('ORGANIZATION_MEMBER_ROLE_ARRAY'),
        ).toEqual(undefined);
    });
    test('Should parse single valid organization member role', () => {
        process.env.ORGANIZATION_MEMBER_ROLE_ARRAY = 'editor';
        expect(
            parseOrganizationMemberRoleArray('ORGANIZATION_MEMBER_ROLE_ARRAY'),
        ).toStrictEqual([OrganizationMemberRole.EDITOR]);
    });
    test('Should parse multiple valid organization member roles', () => {
        process.env.ORGANIZATION_MEMBER_ROLE_ARRAY = 'admin,member';
        expect(
            parseOrganizationMemberRoleArray('ORGANIZATION_MEMBER_ROLE_ARRAY'),
        ).toStrictEqual([
            OrganizationMemberRole.ADMIN,
            OrganizationMemberRole.MEMBER,
        ]);
    });
    test('Should throw ParseError if not a valid organization member role array', () => {
        process.env.ORGANIZATION_MEMBER_ROLE_ARRAY = 'admin,member,invalid';
        expect(() =>
            parseOrganizationMemberRoleArray('ORGANIZATION_MEMBER_ROLE_ARRAY'),
        ).toThrowError(ParseError);
    });
});

describe('process.env.LIGHTDASH_IFRAME_EMBEDDING_DOMAINS', () => {
    test('should be empty array if not set', () => {
        process.env.SECURE_COOKIES = 'true';

        const config = parseConfig();
        expect(config.security.contentSecurityPolicy.frameAncestors).toEqual(
            [],
        );
        expect(config.cookieSameSite).toEqual('lax');
    });

    test('should parse single domain', () => {
        process.env.SECURE_COOKIES = 'true';
        process.env.LIGHTDASH_IFRAME_EMBEDDING_DOMAINS = 'https://example.com';
        const config = parseConfig();
        expect(config.security.contentSecurityPolicy.frameAncestors).toEqual([
            'https://example.com',
        ]);

        expect(config.cookieSameSite).toEqual('none');
    });

    test('should parse multiple domains', () => {
        process.env.SECURE_COOKIES = 'true';
        process.env.LIGHTDASH_IFRAME_EMBEDDING_DOMAINS =
            'https://example.com,https://example.org';
        const config = parseConfig();
        expect(config.security.contentSecurityPolicy.frameAncestors).toEqual([
            'https://example.com',
            'https://example.org',
        ]);
        expect(config.cookieSameSite).toEqual('none');
    });

    test('should throw ParameterError if SECURE_COOKIES is not true', () => {
        process.env.LIGHTDASH_IFRAME_EMBEDDING_DOMAINS =
            'https://example.com,https://example.org';
        expect(() => parseConfig()).toThrowError(ParameterError);
    });

    describe('headlessBrowser configuration', () => {
        beforeEach(() => {
            process.env.HEADLESS_BROWSER_HOST = 'headless-browser-host';
            process.env.HEADLESS_BROWSER_PORT = '3000';
        });
        test('should use ws and port when USE_SECURE_BROWSER is not set', () => {
            const config = parseConfig();
            expect(config.headlessBrowser.browserEndpoint).toEqual(
                'ws://headless-browser-host:3000',
            );
        });

        test('should use wss and omit the port when USE_SECURE_BROWSER is true', () => {
            process.env.USE_SECURE_BROWSER = 'true';
            const config = parseConfig();
            expect(config.headlessBrowser.browserEndpoint).toEqual(
                'wss://headless-browser-host',
            );
        });
    });

    describe('environment variables for API tokens', () => {
        beforeEach(() => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2025-06-19'));

            process.env.LD_SETUP_ADMIN_EMAIL = 'admin@example.com';
            process.env.LD_SETUP_SERVICE_ACCOUNT_EXPIRATION = '0';
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('should parse service account token', () => {
            process.env.LD_SETUP_SERVICE_ACCOUNT_TOKEN =
                'ldsvc_service-account-token';
            const config = parseConfig();
            expect(config.initialSetup?.serviceAccount).toEqual({
                token: 'ldsvc_service-account-token',
                expirationTime: null,
            });
        });

        test('should parse personal access token', () => {
            process.env.LD_SETUP_PROJECT_PAT = 'ldpat_personal-access-token';
            const config = parseConfig();
            expect(config.initialSetup?.project?.personalAccessToken).toBe(
                'ldpat_personal-access-token',
            );
        });

        test('should throw error if service account token is not prefixed with "svc_"', () => {
            process.env.LD_SETUP_SERVICE_ACCOUNT_TOKEN =
                'service-account-token';
            expect(() => parseConfig()).toThrowError(ParseError);
        });

        test('should throw error if personal access token is not prefixed with "pat-"', () => {
            process.env.LD_SETUP_PROJECT_PAT = 'personal-access-token';
            expect(() => parseConfig()).toThrowError(ParseError);
        });
    });
});

describe('parseAndSanitizeSchedulerTasks', () => {
    beforeEach(() => {
        // Clear scheduler environment variables before each test
        delete process.env.SCHEDULER_INCLUDE_TASKS;
        delete process.env.SCHEDULER_EXCLUDE_TASKS;
        // Mock console.warn to capture warning messages
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Default behavior', () => {
        test('should return all tasks when scheduler tasks environment variables are not set or empty', () => {
            // Test with no environment variables set
            const config1 = parseConfig();
            expect(config1.scheduler.tasks).toEqual(ALL_TASK_NAMES);

            // Test with empty string
            process.env.SCHEDULER_INCLUDE_TASKS = '';
            process.env.SCHEDULER_EXCLUDE_TASKS = '';
            const config2 = parseConfig();
            expect(config2.scheduler.tasks).toEqual(ALL_TASK_NAMES);
        });
    });

    describe('Include tasks validation', () => {
        test.each([
            ['handleScheduledDelivery', ['handleScheduledDelivery']],
            [
                'handleScheduledDelivery,sendSlackNotification',
                ['handleScheduledDelivery', 'sendSlackNotification'],
            ],
        ])(
            'should return array with valid include tasks: %s',
            (input, expected) => {
                process.env.SCHEDULER_INCLUDE_TASKS = input;
                const config = parseConfig();
                expect(config.scheduler.tasks).toEqual(expected);
            },
        );

        test('should filter out invalid tasks and warn about them', () => {
            process.env.SCHEDULER_INCLUDE_TASKS =
                'handleScheduledDelivery,invalidTask,sendSlackNotification';
            const config = parseConfig();
            expect(config.scheduler.tasks).toEqual([
                'handleScheduledDelivery',
                'sendSlackNotification',
            ]);
            expect(console.warn).toHaveBeenCalledWith(
                'Invalid scheduler tasks found in SCHEDULER_INCLUDE_TASKS environment variable: invalidTask. These tasks will be ignored.',
            );
        });
    });

    describe('Exclude tasks validation', () => {
        test('should return all tasks except excluded ones', () => {
            process.env.SCHEDULER_EXCLUDE_TASKS =
                'sendEmailNotification,uploadGsheets';
            const config = parseConfig();
            expect(config.scheduler.tasks).toEqual(
                expect.arrayContaining(
                    ALL_TASK_NAMES.filter(
                        (task) =>
                            task !== 'sendEmailNotification' &&
                            task !== 'uploadGsheets',
                    ),
                ),
            );
        });

        test('should filter out invalid exclude tasks and warn about them', () => {
            process.env.SCHEDULER_EXCLUDE_TASKS =
                'invalidTask,sendEmailNotification';
            const config = parseConfig();
            expect(config.scheduler.tasks).toEqual(
                expect.arrayContaining([
                    'handleScheduledDelivery',
                    'sendSlackNotification',
                ]),
            );
            expect(config.scheduler.tasks).not.toEqual(
                expect.arrayContaining(['sendEmailNotification']),
            );
            expect(console.warn).toHaveBeenCalledWith(
                'Invalid scheduler tasks found in SCHEDULER_EXCLUDE_TASKS environment variable: invalidTask. These tasks will be ignored.',
            );
        });
    });

    describe('Include and exclude together', () => {
        test('should throw error if both include and exclude are set', () => {
            process.env.SCHEDULER_INCLUDE_TASKS =
                'handleScheduledDelivery,sendSlackNotification,sendEmailNotification,uploadGsheets';
            process.env.SCHEDULER_EXCLUDE_TASKS = 'sendEmailNotification';
            expect(() => parseConfig()).toThrowError(ParseError);
        });
    });

    describe('Edge cases', () => {
        test('should handle whitespace in include task list', () => {
            process.env.SCHEDULER_INCLUDE_TASKS =
                ' handleScheduledDelivery , sendSlackNotification ';
            const config = parseConfig();
            expect(config.scheduler.tasks).toEqual([
                'handleScheduledDelivery',
                'sendSlackNotification',
            ]);
        });

        test('should not warn when all include tasks are valid', () => {
            process.env.SCHEDULER_INCLUDE_TASKS =
                'handleScheduledDelivery,sendSlackNotification';
            parseConfig();
            expect(console.warn).not.toHaveBeenCalled();
        });
    });
});
