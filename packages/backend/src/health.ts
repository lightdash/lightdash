import { HealthState } from 'common';
import fetch from 'node-fetch';
import database from './database/database';
import { hasUsers } from './database/entities/users';
import { lightdashConfig } from './config/lightdashConfig';

// Cannot be `import` as it's not under TS root dir
const { version: VERSION } = require('../package.json');

const filterByName = (result: { name: string }): boolean =>
    new RegExp('[0-9.]+$').test(result.name);

const sorterByDate = (
    a: { last_updated: string },
    b: { last_updated: string },
): number =>
    Number(new Date(b.last_updated)) - Number(new Date(a.last_updated));

export const getHealthState = async (
    isAuthenticated: boolean,
): Promise<HealthState> => {
    let latestVersion: string | undefined;
    try {
        const response = await fetch(
            'https://hub.docker.com/v2/repositories/lightdash/lightdash/tags',
            { method: 'GET' },
        );
        latestVersion = (await response.json()).results
            .filter(filterByName)
            .sort(sorterByDate)[0].name;
    } catch {
        latestVersion = undefined;
    }

    return {
        healthy: true,
        mode: lightdashConfig.mode,
        version: VERSION,
        needsSetup: !(await hasUsers(database)),
        isAuthenticated,
        latest: { version: latestVersion },
    };
};
