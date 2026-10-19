// Helper function to open browser

import { exec } from 'child_process';
import { promisify } from 'util';
import {
    getAgentConnectionChildEnvironment,
    getAgentConnectionSelection,
} from '../../credentials';
import GlobalState from '../../globalState';

const execAsync = promisify(exec);

export const openBrowser = async (url: string): Promise<boolean> => {
    const childEnv =
        getAgentConnectionSelection() !== null
            ? await getAgentConnectionChildEnvironment()
            : null;
    try {
        const { platform } = process;

        if (platform === 'darwin') {
            if (childEnv !== null)
                await execAsync(`open "${url}"`, { env: childEnv });
            else await execAsync(`open "${url}"`);
        } else if (platform === 'win32') {
            if (childEnv !== null)
                await execAsync(`start "${url}"`, { env: childEnv });
            else await execAsync(`start "${url}"`);
        } else {
            if (childEnv !== null)
                await execAsync(`xdg-open "${url}"`, { env: childEnv });
            else await execAsync(`xdg-open "${url}"`);
        }
        return true;
    } catch (error) {
        GlobalState.debug(`> Could not open browser automatically: ${error}`);
        return false;
    }
};
