import {
    DbtError,
    DbtRpcGetManifestResults,
    isDbtRpcManifestResults,
    SupportedDbtVersions,
    UnexpectedServerError,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { CachedWarehouse, DbtClient } from '../types';
import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';

// Dummy dbt client that doesn't actually run dbt commands
class ManifestDbtClient implements DbtClient {
    private readonly manifest: string;

    constructor(manifest: string) {
        this.manifest = manifest;
    }

    // eslint-disable-next-line class-methods-use-this
    async test(): Promise<void> {
        // No dbt client to test for manifest-based projects
    }

    // eslint-disable-next-line class-methods-use-this
    async getDbtManifest(): Promise<DbtRpcGetManifestResults> {
        if (!this.manifest) {
            throw new UnexpectedServerError(
                'Missing manifest on manifest project adapter',
            );
        }
        const rawManifest = {
            manifest: JSON.parse(this.manifest),
        };

        if (isDbtRpcManifestResults(rawManifest)) {
            return rawManifest;
        }
        throw new DbtError(
            'Cannot read response from dbt, manifest.json not valid',
        );
    }

    // eslint-disable-next-line class-methods-use-this
    getSelector(): string | undefined {
        return undefined;
    }
}

type DbtManifestProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
    cachedWarehouse: CachedWarehouse;
    dbtVersion: SupportedDbtVersions;
    analytics?: LightdashAnalytics;
    manifest: string;
};

export class DbtManifestProjectAdapter extends DbtBaseProjectAdapter {
    constructor({
        warehouseClient,
        cachedWarehouse,
        dbtVersion,
        analytics,
        manifest,
    }: DbtManifestProjectAdapterArgs) {
        // Create a dummy dbt client since we don't need it for manifest-based compilation
        const manifestDbtClient = new ManifestDbtClient(manifest);

        super(
            manifestDbtClient,
            warehouseClient,
            cachedWarehouse,
            dbtVersion,
            undefined, // no dbt project dir
            analytics,
        );
    }
}
