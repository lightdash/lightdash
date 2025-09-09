import { SchemaCompatLayer } from '@mastra/schema-compat';

export type AiToolDependencies<T> = T & {
    schemaCompatLayers: SchemaCompatLayer[] | null;
};
