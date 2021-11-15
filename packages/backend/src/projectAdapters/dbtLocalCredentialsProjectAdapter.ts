import { CreateWarehouseCredentials } from 'common';
import { writeFileSync } from 'fs';
import * as fspromises from 'fs/promises';
import * as path from 'path';
import tempy from 'tempy';
import {
    LIGHTDASH_PROFILE_NAME,
    LIGHTDASH_TARGET_NAME,
    profileFromCredentials,
} from '../dbt/profiles';
import { WarehouseClient } from '../types';
import { DbtLocalProjectAdapter } from './dbtLocalProjectAdapter';

type DbtLocalCredentialsProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
    projectDir: string;
    warehouseCredentials: CreateWarehouseCredentials;
};

export class DbtLocalCredentialsProjectAdapter extends DbtLocalProjectAdapter {
    profilesDir: string;

    constructor({
        warehouseClient,
        projectDir,
        warehouseCredentials,
    }: DbtLocalCredentialsProjectAdapterArgs) {
        const profilesDir = tempy.directory();
        const profilesFilename = path.join(profilesDir, 'profiles.yml');
        const { profile, environment } =
            profileFromCredentials(warehouseCredentials);
        writeFileSync(profilesFilename, profile);
        super({
            warehouseClient,
            target: LIGHTDASH_TARGET_NAME,
            profileName: LIGHTDASH_PROFILE_NAME,
            profilesDir,
            projectDir,
            environment,
        });
        this.profilesDir = profilesDir;
    }

    async destroy() {
        await fspromises.rm(this.profilesDir, { recursive: true, force: true });
        await super.destroy();
    }
}
