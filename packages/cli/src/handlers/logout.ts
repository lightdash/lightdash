import fetch from 'node-fetch';
import { Readable } from 'stream';
import { getConfig, getRawConfig, unsetApiKey } from '../config';
import { refuseAgentConnection } from '../credentials';
import { personalInstanceKey } from '../personalLogin/instanceKey';
import { PersonalLoginStore } from '../personalLogin/store';
import { oauthHeaders } from '../personalLogin/tokenProvider';

export const logoutUnreachable =
    'The server could not confirm logout. The server-side session will remain until it expires. Your local login was kept so you can retry `lightdash logout`.';
export const logout = async (): Promise<void> => {
    refuseAgentConnection(true);
    const config = await getConfig();
    const rawConfig = await getRawConfig();
    const savedKey = rawConfig.context?.apiKey;
    const environmentKey = process.env.LIGHTDASH_API_KEY;
    const environmentOverride =
        !!environmentKey && config.context?.apiKey === environmentKey;
    if (!config.context?.serverUrl)
        throw new Error("Not logged in. Run 'lightdash login --help'");
    const instance = personalInstanceKey(config.context.serverUrl);
    const personal = await new PersonalLoginStore().withLock(async (locked) => {
        const login = await locked.read(instance);
        if (login === null) return false;
        const revoke = async (
            token: string,
            hint: 'refresh_token' | 'access_token',
        ): Promise<void> => {
            try {
                const response = await fetch(
                    `${instance}/api/v1/oauth/revoke`,
                    {
                        method: 'POST',
                        headers: oauthHeaders(),
                        redirect: 'error',
                        signal: AbortSignal.timeout(15_000),
                        body: new URLSearchParams({
                            token,
                            token_type_hint: hint,
                            client_id: 'lightdash-cli',
                        }),
                    },
                );
                if (
                    !response.ok &&
                    (response.status < 400 || response.status >= 500)
                )
                    throw new Error(logoutUnreachable);
                if (response.body instanceof Readable) response.body.destroy();
            } catch {
                throw new Error(logoutUnreachable);
            }
        };
        await revoke(login.tokens.refreshToken, 'refresh_token');
        await revoke(login.tokens.accessToken, 'access_token');
        await locked.remove(instance);
        await locked.clearJournal(instance);
        return true;
    });
    if (!personal && !savedKey && !environmentOverride)
        throw new Error("Not logged in. Run 'lightdash login --help'");
    await unsetApiKey();
    if (savedKey)
        console.error(
            'The saved API key was removed. A personal access token is not revoked by logout.',
        );
    if (environmentOverride) {
        console.error(
            'LIGHTDASH_API_KEY is set in the environment and stays active until unset.',
        );
    } else console.error(`Logged out of ${instance}`);
};
