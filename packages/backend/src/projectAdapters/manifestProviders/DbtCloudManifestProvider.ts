import { DbtPackages, DbtRpcGetManifestResults } from '@lightdash/common';
import { DbtMetadataApiClient } from '../../dbt/DbtMetadataApiClient';
import Logger from '../../logging/logger';
import { DbtCloudManifestProviderArgs, ManifestProvider } from '../types';

/**
 * ManifestProvider implementation that fetches manifest from dbt Cloud Metadata API.
 * Wraps DbtMetadataApiClient to provide manifest access through the composition interface.
 */
export class DbtCloudManifestProvider implements ManifestProvider {
    private readonly dbtClient: DbtMetadataApiClient;

    constructor({
        environmentId,
        bearerToken,
        discoveryApiEndpoint,
        tags,
    }: DbtCloudManifestProviderArgs) {
        this.dbtClient = new DbtMetadataApiClient({
            environmentId,
            bearerToken,
            discoveryApiEndpoint,
            tags,
        });
    }

    async getManifest(): Promise<DbtRpcGetManifestResults> {
        return this.dbtClient.getDbtManifest();
    }

    // eslint-disable-next-line class-methods-use-this
    async getDbtPackages(): Promise<DbtPackages | undefined> {
        // dbt Cloud API doesn't provide packages.yml info
        return undefined;
    }

    // dbt Cloud doesn't need to install deps - it's already done in the cloud
    // No installDeps method needed

    getSelector(): string | undefined {
        return this.dbtClient.getSelector();
    }

    async test(): Promise<void> {
        return this.dbtClient.test();
    }

    // eslint-disable-next-line class-methods-use-this
    async destroy(): Promise<void> {
        Logger.debug('Destroy DbtCloudManifestProvider');
        // DbtMetadataApiClient doesn't have any resources to clean up
    }
}

/**
 * Factory function to create DbtCloudManifestProvider
 */
export const createDbtCloudManifestProvider = (
    args: DbtCloudManifestProviderArgs,
): ManifestProvider => new DbtCloudManifestProvider(args);
