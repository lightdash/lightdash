import {
    DbtRpcDocsGenerateResults,
    DbtRpcGetManifestResults,
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
}

export interface QueryRunner {
    runQuery(sql: string): Promise<Record<string, any>[]>;
}
