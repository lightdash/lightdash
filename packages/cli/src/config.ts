import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import lodash from 'lodash';
import * as os from 'os';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const configDir = path.join(os.homedir(), '.config', 'lightdash');
export const configFilePath = path.join(configDir, 'config.yaml');

export type Config = {
    user?: {
        userUuid?: string;
        anonymousUuid?: string;
        organizationUuid?: string;
    };
    context?: {
        serverUrl?: string;
        project?: string;
        projectName?: string;
        /**
         * This is an API token that is used to authenticate with the Lightdash API.
         * It could be a personal access token or a service account token.
         */
        apiKey?: string;
        proxyAuthorization?: string;
        previewProject?: string;
        previewName?: string;
    };
    answers?: {
        permissionToStoreWarehouseCredentials?: boolean;
        metadataFileGitignoreNoticeShown?: boolean;
    };
};

/** @internal Exported for filesystem-permission regression tests. */
export const ensureConfigFilePermissions = async (
    filePath: string,
): Promise<void> => {
    if (process.platform === 'win32') return;
    await fs.chmod(path.dirname(filePath), 0o700);
    try {
        await fs.chmod(filePath, 0o600);
    } catch (error: unknown) {
        if (
            !(
                error instanceof Error &&
                'code' in error &&
                error.code === 'ENOENT'
            )
        ) {
            throw error;
        }
    }
};

/** @internal Exported for filesystem-permission regression tests. */
export const writeConfigToFile = async (
    filePath: string,
    config: Config,
): Promise<void> => {
    const directory = path.dirname(filePath);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    // Tighten an existing config before overwriting it. `mode` on writeFile
    // only applies when it creates a new file.
    await ensureConfigFilePermissions(filePath);
    await fs.writeFile(filePath, yaml.dump(config), {
        encoding: 'utf8',
        mode: 0o600,
    });

    // `mode` only applies when mkdir/writeFile creates a path. Tighten
    // existing CLI config paths as well; Windows does not implement POSIX
    // permission bits, so leave ACL management to the OS there.
    await ensureConfigFilePermissions(filePath);
};

const setConfig = async (config: Config) => {
    await writeConfigToFile(configFilePath, config);
};

const getRawConfig = async (): Promise<Config> => {
    try {
        await ensureConfigFilePermissions(configFilePath);
        const contents = await fs.readFile(configFilePath, 'utf8');
        const raw = yaml.load(contents);
        return raw as Config;
    } catch (e: unknown) {
        if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
            return {} as Config;
        }
        throw e;
    }
};

const setAnonymousUuid = async (anonymousUuid: string): Promise<Config> => {
    const config = await getRawConfig();
    const newConfig = {
        ...config,
        user: {
            ...(config.user || {}),
            anonymousUuid,
        },
    };
    await setConfig(newConfig);
    return newConfig;
};

export const getConfig = async (): Promise<Config> => {
    let rawConfig = await getRawConfig();
    if (rawConfig.user?.anonymousUuid === undefined) {
        rawConfig = await setAnonymousUuid(uuidv4());
    }
    return {
        ...rawConfig,
        context: {
            ...(rawConfig.context || {}),
            apiKey: process.env.LIGHTDASH_API_KEY || rawConfig.context?.apiKey,
            project:
                process.env.LIGHTDASH_PROJECT || rawConfig.context?.project,
            serverUrl:
                process.env.LIGHTDASH_URL || rawConfig.context?.serverUrl,
            proxyAuthorization:
                process.env.LIGHTDASH_PROXY_AUTHORIZATION ||
                rawConfig.context?.proxyAuthorization,
        },
    };
};

export const setProject = async (projectUuid: string, projectName: string) => {
    const config = await getRawConfig();
    await setConfig({
        ...config,
        context: {
            ...(config.context || {}),
            project: projectUuid,
            projectName,
        },
    });
};

export const unsetProject = async () => {
    const config = await getRawConfig();
    await setConfig({
        ...config,
        context: {
            ...(config.context || {}),
            project: undefined,
            projectName: undefined,
        },
    });
};

export const setPreviewProject = async (projectUuid: string, name: string) => {
    const config = await getRawConfig();
    await setConfig({
        ...config,
        context: {
            ...(config.context || {}),
            previewProject: projectUuid,
            previewName: name,
        },
    });
};

export const unsetPreviewProject = async () => {
    const config = await getRawConfig();
    await setConfig({
        ...config,
        context: {
            ...(config.context || {}),
            previewProject: undefined,
            previewName: undefined,
        },
    });
};

export const setDefaultUser = async (
    userUuid: string,
    organizationUuid: string,
) => {
    const config = await getRawConfig();
    await setConfig({
        ...config,
        user: {
            ...(config.user || {}),
            userUuid,
            organizationUuid,
        },
    });
};

export const setContext = async (context: Config['context']) => {
    const config = await getRawConfig();
    await setConfig({
        ...config,
        context,
    });
};

export const setAnswer = async (answer: Config['answers']) => {
    const config = await getRawConfig();
    await setConfig({
        ...config,
        answers: lodash.merge(config.answers, answer),
    });
};
