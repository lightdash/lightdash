import {
    DbtPackages,
    DbtRpcGetManifestResults,
    SupportedDbtVersions,
} from '@lightdash/common';
import { DbtCliClient } from '../../dbt/dbtCliClient';
import Logger from '../../logging/logger';
import { DbtCliManifestProviderArgs, ManifestProvider } from '../types';

/**
 * ManifestProvider implementation that uses the dbt CLI to compile and get manifest.
 * Wraps DbtCliClient to provide manifest access through the composition interface.
 */
export class DbtCliManifestProvider implements ManifestProvider {
    private readonly dbtClient: DbtCliClient;

    private readonly selector: string | undefined;

    constructor({
        projectDir,
        profilesDir,
        profileName,
        target,
        environment,
        dbtVersion,
        useDbtLs,
        selector,
    }: DbtCliManifestProviderArgs) {
        this.dbtClient = new DbtCliClient({
            dbtProjectDirectory: projectDir,
            dbtProfilesDirectory: profilesDir,
            environment,
            profileName,
            target,
            dbtVersion,
            useDbtLs,
            selector,
        });
        this.selector = selector;
    }

    async getManifest(): Promise<DbtRpcGetManifestResults> {
        return this.dbtClient.getDbtManifest();
    }

    async getDbtPackages(): Promise<DbtPackages | undefined> {
        return this.dbtClient.getDbtPackages();
    }

    async installDeps(): Promise<void> {
        return this.dbtClient.installDeps();
    }

    getSelector(): string | undefined {
        return this.selector;
    }

    async test(): Promise<void> {
        return this.dbtClient.test();
    }

    // eslint-disable-next-line class-methods-use-this
    async destroy(): Promise<void> {
        Logger.debug('Destroy DbtCliManifestProvider');
        // DbtCliClient doesn't have any resources to clean up
    }
}

/**
 * Factory function to create DbtCliManifestProvider
 */
export const createDbtCliManifestProvider = (
    args: DbtCliManifestProviderArgs,
): ManifestProvider => new DbtCliManifestProvider(args);
