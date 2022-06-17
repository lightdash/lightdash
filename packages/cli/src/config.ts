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

export const getConfig = async (): Promise<Config> => {
    try {
        const raw = yaml.load(await fs.readFile(configFilePath, 'utf8'));
        const validated = raw as Config;
        return validated;
    } catch (e) {
        if (e.code === 'ENOENT') {
            return {};
        }
        throw e;
    }
};

export const setConfig = async (config: Config) => {
    await fs.writeFile(configFilePath, yaml.dump(config), 'utf8');
};
