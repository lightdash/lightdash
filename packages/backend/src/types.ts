import {
    DbtPackages,
    DbtRpcDocsGenerateResults,
    DbtRpcGetManifestResults,
    DimensionType,
    Explore,
    ExploreError,
} from '@lightdash/common';

export interface ProjectAdapter {
    compileAllExplores(): Promise<(Explore | ExploreError)[]>;
    getDbtPackages(): Promise<DbtPackages | undefined>;
    runQuery(sql: string): Promise<Record<string, any>[]>;
    test(): Promise<void>;
    destroy(): Promise<void>;
}

export interface DbtClient {
    installDeps(): Promise<void>;
    getDbtManifest(): Promise<DbtRpcGetManifestResults>;
    getDbtCatalog(): Promise<DbtRpcDocsGenerateResults>;
    getDbtPackages?(): Promise<DbtPackages | undefined>;
    test(): Promise<void>;
}

export type WarehouseTableSchema = {
    [column: string]: DimensionType;
};

export type WarehouseCatalog = {
    [database: string]: {
        [schema: string]: {
            [table: string]: WarehouseTableSchema;
        };
    };
};

export interface WarehouseClient {
    getCatalog: (
        config: {
            database: string;
            schema: string;
            table: string;
            columns: string[];
        }[],
    ) => Promise<WarehouseCatalog>;
    runQuery(sql: string): Promise<Record<string, any>[]>;
    test(): Promise<void>;
}

export type CachedWarehouse = {
    warehouseCatalog: WarehouseCatalog | undefined;
    onWarehouseCatalogChange: (warehouseCatalog: WarehouseCatalog) => void;
};
