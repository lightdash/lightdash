import { AuthorizationError } from '@lightdash/common';
import inquirer from 'inquirer';
import fetch from 'node-fetch';
import { URL } from 'url';
import { getConfig, setConfig } from '../config';
import { setProject } from './setProject';

export const login = async (url: string) => {
    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'email',
        },
        {
            type: 'password',
            name: 'password',
        },
    ]);
    const { email, password } = answers;
    const loginUrl = new URL(`/api/v1/login`, url).href;
    const response = await fetch(loginUrl, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        headers: {
            'Content-Type': 'application/json',
        },
    });
    const header = response.headers.get('set-cookie');
    if (header === null) {
        const body = await response.json();
        throw new AuthorizationError(
            `Cannot sign in:\n${JSON.stringify(body)}`,
        );
    }
    const cookie = header.split(';')[0].split('=')[1];
    console.error(cookie);
    const config = await getConfig();
    await setConfig({
        ...config,
        context: {
            ...config.context,
            apiKey: cookie,
        },
    });
    await setProject();
};
