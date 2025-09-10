import {
    DbtPackages,
    DbtRpcGetManifestResults,
    Explore,
    ExploreError,
    LightdashProjectConfig,
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
     * @returns A promise that resolves to an array of explores or explore errors
     */
    compileAllExplores(
        trackingParams: TrackingParams | undefined,
    ): Promise<(Explore | ExploreError)[]>;

    getDbtPackages(): Promise<DbtPackages | undefined>;

    test(): Promise<void>;

    destroy(): Promise<void>;

    getLightdashProjectConfig(
        trackingParams: TrackingParams | undefined,
    ): Promise<LightdashProjectConfig>;
}

export interface DbtClient {
    installDeps?(): Promise<void>;

    getDbtManifest(): Promise<DbtRpcGetManifestResults>;

    getDbtPackages?(): Promise<DbtPackages | undefined>;

    getSelector(): string | undefined;

    test(): Promise<void>;
}

export type CachedWarehouse = {
    warehouseCatalog: WarehouseCatalog | undefined;
    onWarehouseCatalogChange: (warehouseCatalog: WarehouseCatalog) => void;
};
