import {
    DbtManifestVersion,
    DbtPackages,
    DbtRpcDocsGenerateResults,
    DbtRpcGetManifestResults,
    DimensionType,
    Explore,
    ExploreError,
    SupportedDbtVersions,
} from '@lightdash/common';
import { WarehouseCatalog } from '@lightdash/warehouses';

export interface ProjectAdapter {
    compileAllExplores(): Promise<(Explore | ExploreError)[]>;
    getDbtPackages(): Promise<DbtPackages | undefined>;
    runQuery(sql: string): Promise<{
        fields: Record<string, { type: DimensionType }>;
        rows: Record<string, any>[];
    }>;
    test(): Promise<void>;
    destroy(): Promise<void>;
}

export interface DbtClient {
    installDeps(dbtVersion: SupportedDbtVersions): Promise<void>;
    getDbtManifest(
        dbtVersion: SupportedDbtVersions,
    ): Promise<DbtRpcGetManifestResults>;
    getDbtCatalog(
        dbtVersion: SupportedDbtVersions,
    ): Promise<DbtRpcDocsGenerateResults>;
    getDbtPackages?(
        dbtVersion: SupportedDbtVersions,
    ): Promise<DbtPackages | undefined>;
    test(dbtVersion: SupportedDbtVersions): Promise<void>;
}

export type CachedWarehouse = {
    warehouseCatalog: WarehouseCatalog | undefined;
    onWarehouseCatalogChange: (warehouseCatalog: WarehouseCatalog) => void;
};
