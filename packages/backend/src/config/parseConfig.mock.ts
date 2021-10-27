import { LightdashMode } from 'common';

export const UNDEFINED_CONFIG = undefined;

export const EMPTY_CONFIG = {};

export const NO_PROJECTS = {
    version: '1.0',
    projects: [],
};

export const WRONG_VERSION = {
    ...NO_PROJECTS,
    version: 1.1,
};

export const UNRECOGNISED_PROJECT = {
    type: 'what-is this? ',
};

export const LOCAL_PROJECT = {
    type: 'dbt',
    name: 'project',
    profiles_dir: 'hello',
    project_dir: 'yo',
};

export const LOCAL_PROJECT_UNDEFINED_PROJECT_DIR = {
    ...LOCAL_PROJECT,
    project_dir: undefined,
};

export const LOCAL_PROJECT_MISSING_PROFILES_DIR = {
    type: 'dbt',
    name: 'project',
    project_dir: 'hello',
};

export const DBT_CLOUD_IDE_PROJECT = {
    type: 'dbt_cloud_ide',
    name: 'project',
    account_id: '11111',
    project_id: '11111',
    environment_id: '11111',
    api_key: 'abcdef123456',
};

export const wrapProject = (project: object) => ({
    version: '1.0',
    mode: LightdashMode.DEFAULT,
    projects: [project],
});
