import {
    EMPTY_CONFIG,
    LOCAL_PROJECT,
    LOCAL_PROJECT_MISSING_PROFILES_DIR,
    LOCAL_PROJECT_UNDEFINED_PROJECT_DIR,
    LOCAL_PROJECT_NO_PORT,
    LOCAL_PROJECT_NON_INT_PORT,
    LOCAL_PROJECT_PORT_AS_STRING,
    NO_PROJECTS,
    REMOTE_PROJECT,
    REMOTE_PROJECT_INVALID_HOST,
    UNDEFINED_CONFIG,
    UNRECOGNISED_PROJECT,
    wrapProject,
    WRONG_VERSION,
    DBT_CLOUD_IDE_PROJECT,
} from './parseConfig.mock';
import { ParseError } from '../errors';
import { parseConfig } from './parseConfig';

test('Should throw ParseError for undefined config', () => {
    expect(() => parseConfig(UNDEFINED_CONFIG)).toThrowError(ParseError);
});

test('Should throw ParseError for empty config', () => {
    expect(() => parseConfig(EMPTY_CONFIG)).toThrowError(ParseError);
});

test('Should throw ParseError for wrong version', () => {
    expect(() => parseConfig(WRONG_VERSION)).toThrowError(ParseError);
});

test('Should throw ParseError for no projects', () => {
    expect(() => parseConfig(NO_PROJECTS)).toThrowError(ParseError);
});

test('Should throw ParseError for unrecognised project', () => {
    expect(() => parseConfig(UNRECOGNISED_PROJECT)).toThrowError(ParseError);
});

test('Should parse valid local project config', () => {
    const expected = wrapProject(LOCAL_PROJECT);
    expect(parseConfig(expected).projects).toEqual(expected.projects);
});

test('Should parse local project without port', () => {
    const expected = wrapProject(LOCAL_PROJECT);
    expect(parseConfig(wrapProject(LOCAL_PROJECT_NO_PORT)).projects).toEqual(
        expected.projects,
    );
});

test('Should throw ParseError for local project with string port', () => {
    expect(() =>
        parseConfig(wrapProject(LOCAL_PROJECT_PORT_AS_STRING)),
    ).toThrowError(ParseError);
});

test('Should throw ParseError for invalid port', () => {
    expect(() =>
        parseConfig(wrapProject(LOCAL_PROJECT_NON_INT_PORT)),
    ).toThrowError(ParseError);
});

test('Should throw ParseError for missing profiles dir', () => {
    expect(() =>
        parseConfig(wrapProject(LOCAL_PROJECT_MISSING_PROFILES_DIR)),
    ).toThrowError(ParseError);
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

test('Should parse valid remote project config', () => {
    const expected = wrapProject(REMOTE_PROJECT);
    expect(parseConfig(expected).projects).toEqual(expected.projects);
});

test('Should throw ParseError for invalid hostname', () => {
    expect(() =>
        parseConfig(wrapProject(REMOTE_PROJECT_INVALID_HOST)),
    ).toThrowError(ParseError);
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
