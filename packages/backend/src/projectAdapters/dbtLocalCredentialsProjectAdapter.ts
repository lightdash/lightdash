import { CreateWarehouseCredentials } from 'common';
import tempy from 'tempy';
import * as fspromises from 'fs/promises';
import * as path from 'path';
import { writeFileSync } from 'fs';
import {
    LIGHTDASH_PROFILE_NAME,
    LIGHTDASH_TARGET_NAME,
    profileFromCredentials,
} from '../dbt/profiles';
import { DbtLocalProjectAdapter } from './dbtLocalProjectAdapter';
import { QueryRunner } from '../types';

type DbtLocalCredentialsProjectAdapterArgs = {
    queryRunner: QueryRunner | undefined;
    projectDir: string;
    warehouseCredentials: CreateWarehouseCredentials;
    port: number;
};

export class DbtLocalCredentialsProjectAdapter extends DbtLocalProjectAdapter {
    profilesDir: string;

    constructor({
        queryRunner,
        projectDir,
        warehouseCredentials,
        port,
    }: DbtLocalCredentialsProjectAdapterArgs) {
        const profilesDir = tempy.directory();
        const profilesFilename = path.join(profilesDir, 'profiles.yml');
        const { profile, environment } =
            profileFromCredentials(warehouseCredentials);
        writeFileSync(profilesFilename, profile);
        super({
            queryRunner,
            target: LIGHTDASH_TARGET_NAME,
            profileName: LIGHTDASH_PROFILE_NAME,
            profilesDir,
            projectDir,
            port,
            environment,
        });
        this.profilesDir = profilesDir;
    }

    async destroy() {
        await fspromises.rm(this.profilesDir, { recursive: true, force: true });
        await super.destroy();
    }
}
