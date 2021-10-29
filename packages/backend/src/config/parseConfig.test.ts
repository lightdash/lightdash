import {
    EMPTY_CONFIG,
    LOCAL_PROJECT,
    LOCAL_PROJECT_MISSING_PROFILES_DIR,
    LOCAL_PROJECT_UNDEFINED_PROJECT_DIR,
    NO_PROJECTS,
    UNDEFINED_CONFIG,
    UNRECOGNISED_PROJECT,
    wrapProject,
    WRONG_VERSION,
    DBT_CLOUD_IDE_PROJECT,
} from './parseConfig.mock';
import { ParseError } from '../errors';
import { parseConfig } from './parseConfig';

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

test('Should parse without projects', () => {
    expect(parseConfig(NO_PROJECTS).projects).toEqual([]);
});

test('Should throw ParseError for unrecognised project', () => {
    expect(() => parseConfig(UNRECOGNISED_PROJECT)).toThrowError(ParseError);
});

test('Should parse valid local project config', () => {
    const expected = wrapProject(LOCAL_PROJECT);
    expect(parseConfig(expected).projects).toEqual(expected.projects);
});

test('Should parse local project with missing profiles dir', () => {
    const expected = wrapProject(LOCAL_PROJECT_MISSING_PROFILES_DIR);
    expect(
        parseConfig(wrapProject(LOCAL_PROJECT_MISSING_PROFILES_DIR)).projects,
    ).toEqual(expected.projects);
});

test('Should throw ParseError for undefined project dir', () => {
    expect(() =>
        parseConfig(wrapProject(LOCAL_PROJECT_UNDEFINED_PROJECT_DIR)),
    ).toThrowError(ParseError);
});

test('Should parse local config merged with environment variable', () => {
    const expected = wrapProject({
        ...LOCAL_PROJECT_MISSING_PROFILES_DIR,
        profiles_dir: LOCAL_PROJECT.profiles_dir,
    });
    const actual = wrapProject(LOCAL_PROJECT_MISSING_PROFILES_DIR);
    process.env.LIGHTDASH_PROJECT_0_PROFILES_DIR = LOCAL_PROJECT.profiles_dir;
    expect(parseConfig(actual).projects).toEqual(expected.projects);
});

test('Should parse dbt cloud ide config', () => {
    const expected = wrapProject(DBT_CLOUD_IDE_PROJECT);
    expect(parseConfig(expected).projects).toEqual(expected.projects);
});

test('Should parse rudder config from env', () => {
    const expected = {
        dataPlaneUrl: 'customurl',
        writeKey: 'customkey',
    };
    process.env.RUDDERSTACK_DATA_PLANE_URL = 'customurl';
    process.env.RUDDERSTACK_WRITE_KEY = 'customkey';
    expect(parseConfig(wrapProject(LOCAL_PROJECT)).rudder).toEqual(expected);
});

test('Should throw error when secret missing', () => {
    delete process.env.LIGHTDASH_SECRET;
    expect(() => parseConfig(wrapProject(LOCAL_PROJECT))).toThrowError(
        ParseError,
    );
});

test('Should include secret in output', () => {
    process.env.LIGHTDASH_SECRET = 'so very secret';
    expect(parseConfig(wrapProject(LOCAL_PROJECT)).lightdashSecret).toEqual(
        'so very secret',
    );
});

test('Should parse required project config from env', () => {
    process.env.LIGHTDASH_PROJECT_0_PROFILES_DIR = '/usr/ap/profiles';
    expect(parseConfig(wrapProject(LOCAL_PROJECT)).projects[0]).toEqual({
        ...LOCAL_PROJECT,
        profiles_dir: '/usr/ap/profiles',
    });
});

test('Should parse optional project config from env', () => {
    process.env.LIGHTDASH_PROJECT_0_TARGET = 'dev';
    expect(parseConfig(wrapProject(LOCAL_PROJECT)).projects[0]).toEqual({
        ...LOCAL_PROJECT,
        target: 'dev',
    });
});
