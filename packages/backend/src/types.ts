import {
    DbtRpcDocsGenerateResults,
    DbtRpcGetManifestResults,
    DimensionType,
    Explore,
    ExploreError,
} from 'common';

export interface ProjectAdapter {
    compileAllExplores(): Promise<(Explore | ExploreError)[]>;
    runQuery(sql: string): Promise<Record<string, any>[]>;
    test(): Promise<void>;
    destroy(): Promise<void>;
}

export interface DbtClient {
    installDeps(): Promise<void>;
    getDbtManifest(): Promise<DbtRpcGetManifestResults>;
    getDbtCatalog(): Promise<DbtRpcDocsGenerateResults>;
    test(): Promise<void>;
}

export type WarehouseTableSchema = {
    [column: string]: DimensionType;
};

export type WarehouseSchema = {
    [dataset: string]: {
        [table: string]: WarehouseTableSchema;
    };
};

export interface QueryRunner {
    getSchema?: () => Promise<WarehouseSchema>;
    runQuery(sql: string): Promise<Record<string, any>[]>;
    test(): Promise<void>;
}
