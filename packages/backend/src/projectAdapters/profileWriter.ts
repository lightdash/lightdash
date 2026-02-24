/**
 * Helper module for writing dbt profile files.
 * Extracted from DbtLocalCredentialsProjectAdapter for reuse and testability.
 */
import {
    CreateWarehouseCredentials,
    DbtProjectEnvironmentVariable,
} from '@lightdash/common';
import fs, { writeFileSync } from 'fs';
import * as fspromises from 'fs/promises';
import * as path from 'path';
import {
    LIGHTDASH_PROFILE_NAME,
    LIGHTDASH_TARGET_NAME,
    profileFromCredentials,
} from '../dbt/profiles';
import Logger from '../logging/logger';

export interface ProfileWriteResult {
    profilesDir: string;
    profileName: string;
    targetName: string;
    environment: Record<string, string>;
    cleanup: () => Promise<void>;
}

export type WriteWarehouseProfileArgs = {
    warehouseCredentials: CreateWarehouseCredentials;
    targetName?: string;
    environment?: DbtProjectEnvironmentVariable[];
};

/**
 * Writes dbt profile files for warehouse credentials to a temporary directory.
 *
 * Creates:
 * - A temporary directory in /tmp
 * - profiles.yml with the warehouse connection configuration
 * - Any additional files required by the warehouse (e.g., SSL certificates)
 *
 * @returns ProfileWriteResult with the directory path, environment variables, and cleanup function
 */
export function writeWarehouseProfile({
    warehouseCredentials,
    targetName,
    environment,
}: WriteWarehouseProfileArgs): ProfileWriteResult {
    const profilesDir = fs.mkdtempSync('/tmp/local_');
    const profilesFilename = path.join(profilesDir, 'profiles.yml');

    const {
        profile,
        environment: injectedEnvironment,
        files,
    } = profileFromCredentials(warehouseCredentials, profilesDir, targetName);

    // Write any additional files required by the warehouse (e.g., SSL certs)
    if (files) {
        Object.entries(files).forEach(([filePath, content]) => {
            writeFileSync(filePath, content);
        });
    }

    // Write the profiles.yml file
    writeFileSync(profilesFilename, profile);

    // Build the combined environment
    const userEnvironment = (environment || []).reduce<Record<string, string>>(
        (acc, { key, value }) => ({
            ...acc,
            // Ignore empty key strings
            ...(key.length > 0 ? { [key]: value } : {}),
        }),
        {},
    );

    const combinedEnvironment = {
        ...userEnvironment,
        ...injectedEnvironment,
    };

    const cleanup = async () => {
        Logger.debug(`Cleaning up profiles directory: ${profilesDir}`);
        await fspromises.rm(profilesDir, { recursive: true, force: true });
    };

    return {
        profilesDir,
        profileName: LIGHTDASH_PROFILE_NAME,
        targetName: targetName || LIGHTDASH_TARGET_NAME,
        environment: combinedEnvironment,
        cleanup,
    };
}
