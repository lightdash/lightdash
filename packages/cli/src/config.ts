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
    };
};

const setConfig = async (config: Config) => {
    await fs.mkdir(path.dirname(configFilePath), { recursive: true });
    await fs.writeFile(configFilePath, yaml.dump(config), 'utf8');
};

const getRawConfig = async (): Promise<Config> => {
    try {
        const raw = yaml.load(await fs.readFile(configFilePath, 'utf8'));
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
