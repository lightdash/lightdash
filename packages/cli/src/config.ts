import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import * as os from 'os';
import * as path from 'path';

const configDir = path.join(os.homedir(), '.config', 'lightdash');
const configFilePath = path.join(configDir, 'config.yaml');

type Config = {
    context?: {
        serverUrl?: string;
        project?: string;
        apiKey?: string;
    };
};

export const getConfig = async (useEnv: boolean = true): Promise<Config> => {
    let validated: Config;
    try {
        const raw = yaml.load(await fs.readFile(configFilePath, 'utf8'));
        validated = raw as Config;
    } catch (e) {
        if (e.code === 'ENOENT') {
            validated = {};
        } else {
            throw e;
        }
    }
    const envOverrides = {
        ...validated,
        context: {
            ...(validated.context || {}),
            apiKey: process.env.LIGHTDASH_API_KEY || validated.context?.apiKey,
            project:
                process.env.LIGHTDASH_PROJECT || validated.context?.project,
            serverUrl:
                process.env.LIGHTDASH_URL || validated.context?.serverUrl,
        },
    };
    return useEnv ? envOverrides : validated;
};

export const setConfig = async (config: Config) => {
    await fs.mkdir(path.dirname(configFilePath), { recursive: true });
    await fs.writeFile(configFilePath, yaml.dump(config), 'utf8');
};
