import {
    DbtError,
    DbtManifest,
    DbtRpcGetManifestResults,
    isDbtRpcManifestResults,
    SupportedDbtVersions,
    UnexpectedServerError,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { CachedWarehouse, DbtClient } from '../types';
import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';

export type ManifestInput =
    | { manifest: string; parsedManifest?: never }
    | { parsedManifest: DbtManifest; manifest?: never };

// Dummy dbt client that doesn't actually run dbt commands
class ManifestDbtClient implements DbtClient {
    private readonly manifestInput: ManifestInput;

    private readonly selectedModelIds?: string[];

    constructor(manifestInput: ManifestInput, selectedModelIds?: string[]) {
        this.manifestInput = manifestInput;
        this.selectedModelIds = selectedModelIds;
    }

    // eslint-disable-next-line class-methods-use-this
    async test(): Promise<void> {
        // No dbt client to test for manifest-based projects
    }

    // eslint-disable-next-line class-methods-use-this
    async getDbtManifest(): Promise<DbtRpcGetManifestResults> {
        const { manifest, parsedManifest } = this.manifestInput;
        if (!manifest && !parsedManifest) {
            throw new UnexpectedServerError(
                'Missing manifest on manifest project adapter',
            );
        }
        let manifestValue: unknown = parsedManifest;
        if (parsedManifest === undefined) {
            try {
                manifestValue = JSON.parse(manifest);
            } catch {
                throw new DbtError(
                    'Cannot read response from dbt, manifest.json not valid',
                );
            }
        }
        const rawManifest = {
            manifest: manifestValue,
            ...(this.selectedModelIds !== undefined
                ? { selectedModelIds: this.selectedModelIds }
                : {}),
        };

        if (isDbtRpcManifestResults(rawManifest)) {
            return {
                ...rawManifest,
                ...(this.selectedModelIds
                    ? { selectedModelIds: this.selectedModelIds }
                    : {}),
            };
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

type DbtManifestProjectAdapterArgs = ManifestInput & {
    warehouseClient: WarehouseClient;
    cachedWarehouse: CachedWarehouse;
    dbtVersion: SupportedDbtVersions;
    analytics?: LightdashAnalytics;
    // Optional dbt project dir to read lightdash.config.yml / project_context.yml
    // from. Used by the multiple-dbt-sources merge to point the merged manifest
    // adapter at the primary source's checkout so its project config is kept.
    dbtProjectDir?: string;
    selectedModelIds?: string[];
};

export class DbtManifestProjectAdapter extends DbtBaseProjectAdapter {
    constructor({
        warehouseClient,
        cachedWarehouse,
        dbtVersion,
        analytics,
        manifest,
        parsedManifest,
        dbtProjectDir,
        selectedModelIds,
    }: DbtManifestProjectAdapterArgs) {
        // Create a dummy dbt client since we don't need it for manifest-based compilation
        const manifestDbtClient = new ManifestDbtClient(
            parsedManifest !== undefined ? { parsedManifest } : { manifest },
            selectedModelIds,
        );

        super(
            manifestDbtClient,
            warehouseClient,
            cachedWarehouse,
            dbtVersion,
            dbtProjectDir,
            analytics,
        );
    }
}
