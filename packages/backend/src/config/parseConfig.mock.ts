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
    rpc_server_port: 8580,
};

export const LOCAL_PROJECT_NO_PORT = {
    ...LOCAL_PROJECT,
    rpc_server_port: undefined,
};

export const LOCAL_PROJECT_PORT_AS_STRING = {
    ...LOCAL_PROJECT,
    rpc_server_port: '8580',
};

export const LOCAL_PROJECT_NON_INT_PORT = {
    ...LOCAL_PROJECT,
    rpc_server_port: 1.1,
};

export const LOCAL_PROJECT_UNDEFINED_PROJECT_DIR = {
    ...LOCAL_PROJECT,
    project_dir: undefined,
};

export const LOCAL_PROJECT_MISSING_PROFILES_DIR = {
    type: 'dbt',
    name: 'project',
    project_dir: 'hello',
    rpc_server_port: 8580,
};

export const REMOTE_PROJECT = {
    type: 'dbt_remote_server',
    name: 'project',
    rpc_server_host: 'localhost',
    rpc_server_port: 4444,
};

export const REMOTE_PROJECT_INVALID_HOST = {
    ...REMOTE_PROJECT,
    rpc_server_host: 'localhost!!',
};

export const wrapProject = (project: object) => ({
    version: '1.0',
    projects: [project],
});
