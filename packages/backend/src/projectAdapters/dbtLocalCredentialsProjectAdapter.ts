import {
    CreateWarehouseCredentials,
    DbtProjectEnvironmentVariable,
    SupportedDbtVersions,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import fs, { writeFileSync } from 'fs';
import * as fspromises from 'fs/promises';
import * as path from 'path';
import {
    LIGHTDASH_PROFILE_NAME,
    LIGHTDASH_TARGET_NAME,
    profileFromCredentials,
} from '../dbt/profiles';
import Logger from '../logging/logger';
import { CachedWarehouse } from '../types';
import { DbtLocalProjectAdapter } from './dbtLocalProjectAdapter';

type DbtLocalCredentialsProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
    projectDir: string;
    warehouseCredentials: CreateWarehouseCredentials;
    targetName: string | undefined;
    environment: DbtProjectEnvironmentVariable[] | undefined;
    cachedWarehouse: CachedWarehouse;
    dbtVersion: SupportedDbtVersions;
    useDbtLs: boolean;
};

export class DbtLocalCredentialsProjectAdapter extends DbtLocalProjectAdapter {
    profilesDir: string;

    constructor({
        warehouseClient,
        projectDir,
        warehouseCredentials,
        targetName,
        environment,
        cachedWarehouse,
        dbtVersion,
        useDbtLs,
    }: DbtLocalCredentialsProjectAdapterArgs) {
        const profilesDir = fs.mkdtempSync('/tmp/local_');
        const profilesFilename = path.join(profilesDir, 'profiles.yml');

        const {
            profile,
            environment: injectedEnvironment,
            files,
        } = profileFromCredentials(
            warehouseCredentials,
            profilesDir,
            targetName,
        );
        if (files) {
            Object.entries(files).forEach(([filePath, content]) => {
                writeFileSync(filePath, content);
            });
        }
        writeFileSync(profilesFilename, profile);
        const e = (environment || []).reduce<Record<string, string>>(
            (previousValue, { key, value }) => ({
                ...previousValue,
                ...(key.length > 0 ? { [key]: value } : {}), // ignore empty strings
            }),
            {},
        );
        const updatedEnvironment = {
            ...e,
            ...injectedEnvironment,
        };
        super({
            warehouseClient,
            target: targetName || LIGHTDASH_TARGET_NAME,
            profileName: LIGHTDASH_PROFILE_NAME,
            profilesDir,
            projectDir,
            environment: updatedEnvironment,
            cachedWarehouse,
            dbtVersion,
            useDbtLs,
        });
        this.profilesDir = profilesDir;
    }

    async destroy() {
        Logger.debug(`Destroy local project adapter`);
        await fspromises.rm(this.profilesDir, { recursive: true, force: true });
        await super.destroy();
    }
}
