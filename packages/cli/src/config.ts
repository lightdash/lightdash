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
    };
    context?: {
        serverUrl?: string;
        project?: string;
        apiKey?: string;
    };
    answers?: {
        permissionToStoreWarehouseCredentials?: boolean;
    };
};

export const setConfig = async (config: Config) => {
    await fs.mkdir(path.dirname(configFilePath), { recursive: true });
    await fs.writeFile(configFilePath, yaml.dump(config), 'utf8');
};

const getRawConfig = async (): Promise<Config> => {
    try {
        const raw = yaml.load(await fs.readFile(configFilePath, 'utf8'));
        return raw as Config;
    } catch (e: any) {
        if (e.code === 'ENOENT') {
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
        },
    };
};

export const setProjectUuid = async (projectUuid: string) => {
    const config = await getRawConfig();
    await setConfig({
        ...config,
        context: {
            ...(config.context || {}),
            project: projectUuid,
        },
    });
};

export const setDefaultUser = async (userUuid: string) => {
    const config = await getRawConfig();
    await setConfig({
        ...config,
        user: {
            ...(config.user || {}),
            userUuid,
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
