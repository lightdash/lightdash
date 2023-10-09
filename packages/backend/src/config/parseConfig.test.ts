import { ParseError } from '@lightdash/common';
import { VERSION } from '../version';
import { getIntegerFromEnvironmentVariable, parseConfig } from './parseConfig';
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
    const expected = {
        dsn: '',
        release: VERSION,
        environment: BASIC_CONFIG.mode,
    };
    expect(parseConfig(BASIC_CONFIG).sentry).toStrictEqual(expected);
});

test('Should parse sentry config from env', () => {
    const expected = {
        dsn: 'mydsn.sentry.io',
        release: VERSION,
        environment: 'development',
    };
    process.env.SENTRY_DSN = 'mydsn.sentry.io';
    process.env.NODE_ENV = 'development';
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
