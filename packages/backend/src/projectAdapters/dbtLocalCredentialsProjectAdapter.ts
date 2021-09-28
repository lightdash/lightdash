import { CreateWarehouseCredentials } from 'common';
import tempy from 'tempy';
import * as path from 'path';
import { writeFileSync } from 'fs';
import {
    LIGHTDASH_PROFILE_NAME,
    LIGHTDASH_TARGET_NAME,
    profileFromCredentials,
} from '../dbt/profiles';
import { DbtLocalProjectAdapter } from './dbtLocalProjectAdapter';

type DbtLocalCredentialsProjectAdapterArgs = {
    projectDir: string;
    warehouseCredentials: CreateWarehouseCredentials;
    port: number;
};

export class DbtLocalCredentialsProjectAdapter extends DbtLocalProjectAdapter {
    constructor({
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
            target: LIGHTDASH_TARGET_NAME,
            profileName: LIGHTDASH_PROFILE_NAME,
            profilesDir,
            projectDir,
            port,
            environment,
        });
    }
}
