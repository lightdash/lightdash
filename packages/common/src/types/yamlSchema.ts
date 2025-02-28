import type { DbtColumnMetadata, DbtModelMetadata } from './dbt';

export type YamlColumn = {
    name: string;
    description?: string;
    meta?: DbtColumnMetadata;
};

export type YamlModel = {
    name: string;
    description?: string;
    columns?: YamlColumn[];
    meta?: DbtModelMetadata;
};

export type YamlSchema = {
    version?: number;
    models?: YamlModel[];
};
