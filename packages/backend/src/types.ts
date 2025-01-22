import {
    DbtPackages,
    DbtRpcGetManifestResults,
    Explore,
    ExploreError,
    LightdashProjectConfig,
} from '@lightdash/common';
import { WarehouseCatalog } from '@lightdash/warehouses';

export interface ProjectAdapter {
    compileAllExplores(): Promise<(Explore | ExploreError)[]>;

    getDbtPackages(): Promise<DbtPackages | undefined>;

    test(): Promise<void>;

    destroy(): Promise<void>;

    getLightdashProjectConfig(): Promise<LightdashProjectConfig>;
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
