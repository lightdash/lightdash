import type { CatalogMetricsTreeNode } from '../types/catalog';

export function getMetricsTreeNodeId(field: CatalogMetricsTreeNode) {
    return `${field.name}_${field.tableName}`;
}

export function parseMetricsTreeNodeId(id: string): CatalogMetricsTreeNode {
    const [name, tableName] = id.split('_');

    if (!name || !tableName) {
        throw new Error('Invalid metrics tree node id');
    }

    return {
        name,
        tableName,
    };
}
