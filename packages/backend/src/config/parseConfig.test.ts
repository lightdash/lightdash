import {
    LightdashMode,
    OrganizationMemberRole,
    ParseError,
    SentryConfig,
} from '@lightdash/common';
import { ORGANIZATION_ADMIN } from '@lightdash/common/dist/authorization/organizationMemberAbility.mock';
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
    };
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
