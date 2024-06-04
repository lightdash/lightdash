import { ParseError, SentryConfig } from '@lightdash/common';
import { VERSION } from '../version';
import {
    getIntegerFromEnvironmentVariable,
    getMaybeBase64EncodedFromEnvironmentVariable,
    parseConfig,
} from './parseConfig';
import {
    BASIC_CONFIG,
    EMPTY_CONFIG,
    UNDEFINED_CONFIG,
    WRONG_VERSION,
} from './parseConfig.mock';

jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    writeFile: jest.fn(),
}));

beforeEach(() => {
    process.env = {
        LIGHTDASH_SECRET: 'not very secret',
    };
});

test('Should throw ParseError for undefined config', () => {
    expect(() => parseConfig(UNDEFINED_CONFIG)).toThrowError(ParseError);
});

test('Should throw ParseError for empty config', () => {
    expect(() => parseConfig(EMPTY_CONFIG)).toThrowError(ParseError);
});

test('Should throw ParseError for wrong version', () => {
    expect(() => parseConfig(WRONG_VERSION)).toThrowError(ParseError);
});

test('Should parse rudder config from env', () => {
    const expected = {
        dataPlaneUrl: 'customurl',
        writeKey: 'customkey',
    };
    process.env.RUDDERSTACK_DATA_PLANE_URL = 'customurl';
    process.env.RUDDERSTACK_WRITE_KEY = 'customkey';
    expect(parseConfig(BASIC_CONFIG).rudder).toEqual(expected);
});

test('Should use default sentry configuration if no environment vars', () => {
    const expected: SentryConfig = {
        backend: {
            dsn: '',
        },
        frontend: {
            dsn: '',
        },
        release: VERSION,
        environment: BASIC_CONFIG.mode,
        tracesSampleRate: 0.1,
        profilesSampleRate: 0.2,
        anr: {
            enabled: false,
            captureStacktrace: false,
            timeout: undefined,
        },
    };
    expect(parseConfig(BASIC_CONFIG).sentry).toStrictEqual(expected);
});

test('Should parse sentry config from env', () => {
    const expected: SentryConfig = {
        backend: {
            dsn: 'mydsnbackend.sentry.io',
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
    expect(parseConfig(BASIC_CONFIG).sentry).toStrictEqual(expected);
});

test('Should throw error when secret missing', () => {
    delete process.env.LIGHTDASH_SECRET;
    expect(() => parseConfig(BASIC_CONFIG)).toThrowError(ParseError);
});

test('Should include secret in output', () => {
    process.env.LIGHTDASH_SECRET = 'so very secret';
    expect(parseConfig(BASIC_CONFIG).lightdashSecret).toEqual('so very secret');
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
    expect(getIntegerFromEnvironmentVariable('MY_NUMBER')).toEqual(0.5);
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
