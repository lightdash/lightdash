import type { CatalogMetricsTreeNode } from '../types/catalog';

export const MAX_METRICS_TREE_NODE_COUNT = 30;

export function getMetricsTreeNodeId(field: CatalogMetricsTreeNode) {
    return `${field.tableName}::${field.name}`;
}

export function parseMetricsTreeNodeId(id: string): CatalogMetricsTreeNode {
    const [tableName, name] = id.split('::');

    if (!tableName || !name) {
        throw new Error('Invalid metrics tree node id');
    }

    return {
        name,
        tableName,
    };
}
