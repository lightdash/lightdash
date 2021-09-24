import {
    DbtProjectConfig,
    HealthState,
    sensitiveDbtCredentialsFieldNames,
} from 'common';
import fetch from 'node-fetch';
import database from './database/database';
import { hasUsers } from './database/entities/users';
import { lightdashConfig } from './config/lightdashConfig';
import { VERSION } from './version';
import { projectService } from './services/services';

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

    const needsProject = !(await projectService.hasProject());

    const defaultProject =
        needsProject && lightdashConfig.projects[0]
            ? (Object.fromEntries(
                  Object.entries(lightdashConfig.projects[0]).filter(
                      ([key]) =>
                          !sensitiveDbtCredentialsFieldNames.includes(
                              key as any,
                          ),
                  ),
              ) as DbtProjectConfig)
            : undefined;

    return {
        healthy: true,
        mode: lightdashConfig.mode,
        version: VERSION,
        needsSetup: !(await hasUsers(database)),
        needsProject,
        defaultProject,
        isAuthenticated,
        latest: { version: latestVersion },
        rudder: lightdashConfig.rudder,
    };
};
