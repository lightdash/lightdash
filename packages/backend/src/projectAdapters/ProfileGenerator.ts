import {
    CreateWarehouseCredentials,
    DbtProjectEnvironmentVariable,
} from '@lightdash/common';
import * as fs from 'fs';
import * as fspromises from 'fs/promises';
import * as path from 'path';
import {
    LIGHTDASH_PROFILE_NAME,
    LIGHTDASH_TARGET_NAME,
    profileFromCredentials,
} from '../dbt/profiles';
import Logger from '../logging/logger';
import { ProfileGenerator, ProfileGeneratorResult } from './types';

export type WarehouseProfileGeneratorArgs = {
    /** Warehouse credentials to generate profile from */
    warehouseCredentials: CreateWarehouseCredentials;
    /** Optional custom target name (defaults to 'prod') */
    targetName?: string;
    /** Optional additional environment variables from project config */
    environment?: DbtProjectEnvironmentVariable[];
};

/**
 * ProfileGenerator implementation that generates dbt profiles from warehouse credentials.
 * Creates a temporary directory containing profiles.yml and any additional required files.
 */
export class WarehouseProfileGenerator implements ProfileGenerator {
    private readonly profilesDir: string;

    private readonly targetName: string;

    private readonly environment: Record<string, string>;

    private generated: boolean = false;

    constructor({
        warehouseCredentials,
        targetName,
        environment,
    }: WarehouseProfileGeneratorArgs) {
        // Create temp directory for profiles
        this.profilesDir = fs.mkdtempSync('/tmp/profiles_');
        this.targetName = targetName || LIGHTDASH_TARGET_NAME;

        // Generate profile from credentials
        const {
            profile,
            environment: injectedEnvironment,
            files,
        } = profileFromCredentials(
            warehouseCredentials,
            this.profilesDir,
            this.targetName,
        );

        // Write additional files (certificates, keys, etc.)
        if (files) {
            Object.entries(files).forEach(([filePath, content]) => {
                fs.writeFileSync(filePath, content);
            });
        }

        // Write profiles.yml
        const profilesFilename = path.join(this.profilesDir, 'profiles.yml');
        fs.writeFileSync(profilesFilename, profile);

        // Merge user-provided environment with injected (credential) environment
        const userEnvironment = (environment || []).reduce<
            Record<string, string>
        >(
            (acc, { key, value }) => ({
                ...acc,
                ...(key.length > 0 ? { [key]: value } : {}), // ignore empty strings
            }),
            {},
        );

        this.environment = {
            ...userEnvironment,
            ...injectedEnvironment, // Credential env vars take precedence
        };

        this.generated = true;
    }

    generate(): ProfileGeneratorResult {
        if (!this.generated) {
            throw new Error(
                'ProfileGenerator has been destroyed and cannot be used',
            );
        }

        return {
            profilesDir: this.profilesDir,
            profileName: LIGHTDASH_PROFILE_NAME,
            targetName: this.targetName,
            environment: this.environment,
        };
    }

    async destroy(): Promise<void> {
        Logger.debug(`Destroy WarehouseProfileGenerator: ${this.profilesDir}`);
        if (this.generated) {
            await fspromises.rm(this.profilesDir, {
                recursive: true,
                force: true,
            });
            this.generated = false;
        }
    }
}

/**
 * Factory function to create WarehouseProfileGenerator
 */
export const createProfileGenerator = (
    args: WarehouseProfileGeneratorArgs,
): ProfileGenerator => new WarehouseProfileGenerator(args);
