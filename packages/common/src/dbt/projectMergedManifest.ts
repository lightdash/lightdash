import merge from 'lodash/merge';
import { type DbtManifest } from '../types/dbt';

const MODEL_FIELDS = [
    'unique_id',
    'name',
    'database',
    'schema',
    'relation_name',
    'resource_type',
    'package_name',
    'path',
    'patch_path',
    'description',
    'tags',
    'config',
    'meta',
    'columns',
    'compiled',
    'depends_on',
    'lightdash_source_name',
] as const;

const COLUMN_FIELDS = [
    'name',
    'description',
    'meta',
    'data_type',
    'timestamp_domain',
] as const;

const pickFields = (
    source: Record<string, unknown>,
    fields: readonly string[],
): Record<string, unknown> =>
    Object.fromEntries(
        fields
            .filter((field) =>
                Object.prototype.hasOwnProperty.call(source, field),
            )
            .map((field) => [field, source[field]]),
    );

const projectMeta = (
    source: Record<string, unknown>,
): Record<string, unknown> | undefined => {
    const config =
        source.config && typeof source.config === 'object'
            ? (source.config as Record<string, unknown>)
            : undefined;
    if (
        !Object.prototype.hasOwnProperty.call(source, 'meta') &&
        !config?.meta
    ) {
        return undefined;
    }
    return merge({}, source.meta, config?.meta);
};

const projectModelNode = (
    node: Record<string, unknown>,
): Record<string, unknown> => {
    const projected = pickFields(node, MODEL_FIELDS);
    const meta = projectMeta(node);
    if (meta) {
        projected.meta = meta;
    }
    if (projected.config && typeof projected.config === 'object') {
        const { meta: _meta, ...config } = projected.config as Record<
            string,
            unknown
        >;
        projected.config = config;
    }
    if (projected.columns && typeof projected.columns === 'object') {
        projected.columns = Object.fromEntries(
            Object.entries(
                projected.columns as Record<string, Record<string, unknown>>,
            ).map(([name, column]) => {
                const projectedColumn = pickFields(column, COLUMN_FIELDS);
                const columnMeta = projectMeta(column);
                if (columnMeta) {
                    projectedColumn.meta = columnMeta;
                }
                return [name, projectedColumn];
            }),
        );
    }
    return projected;
};

export const projectMergedManifest = (manifest: DbtManifest): DbtManifest => ({
    metadata: manifest.metadata,
    metrics: manifest.metrics,
    docs: manifest.docs,
    sources: manifest.sources,
    macros: manifest.macros,
    semantic_models: manifest.semantic_models,
    nodes: Object.fromEntries(
        Object.entries(manifest.nodes).map(([uniqueId, node]) => [
            uniqueId,
            ['model', 'seed'].includes(node.resource_type)
                ? projectModelNode(node as unknown as Record<string, unknown>)
                : node,
        ]),
    ) as DbtManifest['nodes'],
});
