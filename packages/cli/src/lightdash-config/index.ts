import {
    DEFAULT_SPOTLIGHT_CONFIG,
    loadLightdashProjectConfig,
} from '@lightdash/common';
import fs from 'fs/promises';
import path from 'path';
import GlobalState from '../globalState';

export const readAndLoadLightdashProjectConfig = async (projectDir: string) => {
    const configPath = path.join(projectDir, 'lightdash.config.yml');
    try {
        const fileContents = await fs.readFile(configPath, 'utf8');
        const config = await loadLightdashProjectConfig(fileContents);
        return config;
    } catch (e) {
        GlobalState.debug(`No lightdash.config.yml found in ${configPath}`);

        if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
            // Return default config if file doesn't exist
            return {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            };
        }
        throw e;
    }
};
