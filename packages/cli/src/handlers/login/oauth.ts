// Helper function to open browser

import { exec } from 'child_process';
import { promisify } from 'util';
import GlobalState from '../../globalState';

const execAsync = promisify(exec);

export const openBrowser = async (url: string): Promise<void> => {
    try {
        const { platform } = process;

        if (platform === 'darwin') {
            await execAsync(`open "${url}"`);
        } else if (platform === 'win32') {
            await execAsync(`start "${url}"`);
        } else {
            await execAsync(`xdg-open "${url}"`);
        }
    } catch (error) {
        GlobalState.debug(`> Could not open browser automatically: ${error}`);
    }
};
