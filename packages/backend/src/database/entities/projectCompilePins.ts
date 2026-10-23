import { type Knex } from 'knex';

export const ProjectCatalogueGenerationsTableName =
    'project_catalogue_generations';
export const ProjectSourceGenerationsTableName = 'project_source_generations';
export const ProjectCompilePinsTableName = 'project_compile_pins';

export type CompileSlice = {
    sourceUuid: string;
    sourceName: string;
    generation: number;
};

export type CompilePin = {
    sourceUuid: string;
    commitSha: string | null;
    dbtProjectName: string | null;
    capturedAt: string;
    deployMetadata: {
        userUuid: string;
        requestMethod: string;
        compilationSource: string;
    } | null;
};

export type CompileBinding = {
    consumerSourceUuid: string;
    consumerNodeId: string;
    refPackage: string | null;
    refName: string;
    requestedVersion: string | null;
    providerSourceUuid: string;
    providerPackage: string;
    providerName: string;
    resolvedVersion: string | null;
    providerCommitSha: string | null;
};

type DbProjectCatalogueGeneration = {
    project_uuid: string;
    generation: string;
};

type DbProjectSourceGeneration = DbProjectCatalogueGeneration & {
    source_uuid: string;
};

export type DbProjectCompilePins = {
    project_uuid: string;
    compile_job_uuid: string;
    generation: string;
    pins: CompilePin[];
    bindings: CompileBinding[];
    metadata_bytes: number;
    created_at: Date;
};

export type ProjectCatalogueGenerationsTable = Knex.CompositeTableType<
    DbProjectCatalogueGeneration,
    { project_uuid: string; generation?: number }
>;

export type ProjectSourceGenerationsTable = Knex.CompositeTableType<
    DbProjectSourceGeneration,
    { project_uuid: string; source_uuid: string; generation?: number }
>;

export type ProjectCompilePinsTable = Knex.CompositeTableType<
    DbProjectCompilePins,
    Omit<
        DbProjectCompilePins,
        'generation' | 'pins' | 'bindings' | 'created_at'
    > & {
        generation: number;
        pins: string;
        bindings: string;
    }
>;
