import {
    type DbtPackages,
    type DbtRpcGetManifestResults,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import { type WarehouseCatalog } from '@lightdash/warehouses';

export interface ProjectAdapter {
    compileAllExplores(): Promise<(Explore | ExploreError)[]>;

    getDbtPackages(): Promise<DbtPackages | undefined>;

    test(): Promise<void>;

    destroy(): Promise<void>;
}

export interface DbtClient {
    installDeps?(): Promise<void>;

    getDbtManifest(): Promise<DbtRpcGetManifestResults>;

    getDbtPackages?(): Promise<DbtPackages | undefined>;

    test(): Promise<void>;
}

export type CachedWarehouse = {
    warehouseCatalog: WarehouseCatalog | undefined;
    onWarehouseCatalogChange: (warehouseCatalog: WarehouseCatalog) => void;
};
