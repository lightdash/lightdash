import { DbtError } from '@lightdash/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import Logger from '../../logging/logger';
import { SourceAccessor } from '../types';

export type LocalSourceAccessorArgs = {
    /** Path to the dbt project directory */
    projectDir: string;
};

/**
 * SourceAccessor implementation for local filesystem dbt projects.
 * Simply validates that the project directory exists.
 */
export class LocalSourceAccessor implements SourceAccessor {
    private readonly projectDir: string;

    constructor({ projectDir }: LocalSourceAccessorArgs) {
        this.projectDir = projectDir;
    }

    getProjectDirectory(): string {
        return this.projectDir;
    }

    async refresh(): Promise<void> {
        // Local filesystem doesn't need refreshing
        // Just validate the directory still exists
        await this.test();
    }

    async test(): Promise<void> {
        try {
            await fs.access(this.projectDir);
            // Also check for dbt_project.yml to verify it's a valid dbt project
            const dbtProjectPath = path.join(
                this.projectDir,
                'dbt_project.yml',
            );
            await fs.access(dbtProjectPath);
        } catch (e) {
            throw new DbtError(
                `dbt project directory not found or invalid: ${path.basename(this.projectDir)}`,
            );
        }
    }

    // eslint-disable-next-line class-methods-use-this
    async destroy(): Promise<void> {
        Logger.debug('Destroy LocalSourceAccessor');
        // Local filesystem accessor doesn't own the directory, so nothing to clean up
    }
}

/**
 * Factory function to create LocalSourceAccessor
 */
export const createLocalSourceAccessor = (
    args: LocalSourceAccessorArgs,
): SourceAccessor => new LocalSourceAccessor(args);
