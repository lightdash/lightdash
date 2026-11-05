import { execFile } from 'child_process';
import { refuseAgentConnection } from '../../credentials';

export const openConnectionBrowser = (url: string): Promise<boolean> => {
    refuseAgentConnection(true);
    const { platform } = process;
    let executable = 'xdg-open';
    if (platform === 'darwin') executable = 'open';
    else if (platform === 'win32') executable = 'rundll32.exe';
    const args =
        platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
    const env = { ...process.env };
    delete env.LIGHTDASH_API_KEY;
    delete env.LIGHTDASH_PROXY_AUTHORIZATION;
    return new Promise((resolve) => {
        execFile(
            executable,
            args,
            { timeout: 5000, shell: false, env },
            (error) => resolve(error === null),
        );
    });
};
