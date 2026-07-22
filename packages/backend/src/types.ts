import {
    DbtPackages,
    DbtRpcGetManifestResults,
    Explore,
    ExploreError,
    LightdashProjectConfig,
    ProjectContextEntry,
} from '@lightdash/common';
import { WarehouseCatalog } from '@lightdash/warehouses';

export type TrackingParams = {
    userUuid: string;
    organizationUuid: string;
    projectUuid: string;
};

export interface ProjectAdapter {
    /**
     * Compile all explores
     * @param trackingParams - Optional tracking parameters to track the compilation and lightdash project config (lightdash.config.yml) overrides
     * @param loadSources - Whether to load source information for each explore
     * @param allowPartialCompilation - When true, fields that fail to compile will be marked with errors instead of failing the entire explore
     * @returns A promise that resolves to an array of explores or explore errors
     */
    compileAllExplores(
        trackingParams: TrackingParams | undefined,
        loadSources?: boolean,
        allowPartialCompilation?: boolean,
    ): Promise<(Explore | ExploreError)[]>;

    getDbtPackages(): Promise<DbtPackages | undefined>;

    /**
     * Fetch this source's compiled dbt manifest without compiling explores. Used
     * by the multiple-dbt-sources merge to combine each source's manifest before
     * a single compile.
     */
    getDbtManifest(): Promise<DbtRpcGetManifestResults>;

    test(): Promise<void>;

    destroy(): Promise<void>;

    getLightdashProjectConfig(
        trackingParams: TrackingParams | undefined,
    ): Promise<LightdashProjectConfig>;

    getProjectContext(): Promise<ProjectContextEntry[]>;

    /**
     * Local dbt project directory this adapter reads `lightdash.config.yml` and
     * `lightdash.project_context.yml` from. Undefined for adapters with no
     * checkout (manifest-only, dbt Cloud, none). The multiple-dbt-sources merge
     * passes the primary source's dir to the merged manifest adapter so the
     * combined compile keeps the primary's project config.
     */
    dbtProjectDir?: string;
}

export interface DbtClient {
    installDeps?(): Promise<void>;

    getDbtManifest(): Promise<DbtRpcGetManifestResults>;

    getDbtPackages?(): Promise<DbtPackages | undefined>;

    getSelector(): string | undefined;

    test(): Promise<void>;

    cleanup?(): Promise<void>;
}

export type CachedWarehouse = {
    warehouseCatalog: WarehouseCatalog | undefined;
    onWarehouseCatalogChange: (warehouseCatalog: WarehouseCatalog) => void;
};
