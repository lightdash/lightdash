import { type TreeNodeData } from '@mantine-8/core';
import { type NestableItem } from './types';

export const convertNestableListToTree = (
    items: NestableItem[],
): TreeNodeData[] => {
    const itemPaths = new Set(items.map((item) => item.path));

    // Find the nearest ancestor path that exists in the items list.
    // Returns '' (root) if no ancestor is present.
    const findEffectiveParent = (path: string): string => {
        const parts = path.split('.');
        for (let i = parts.length - 2; i >= 0; i--) {
            const ancestorPath = parts.slice(0, i + 1).join('.');
            if (itemPaths.has(ancestorPath)) {
                return ancestorPath;
            }
        }
        return '';
    };

    const buildTree = (
        nodes: NestableItem[],
        parentPath = '',
    ): TreeNodeData[] => {
        return nodes
            .filter((item) => findEffectiveParent(item.path) === parentPath)
            .map((item) => {
                const children = buildTree(nodes, item.path);
                return {
                    label: item.name,
                    value: item.path,
                    nodeProps: { uuid: item.uuid },
                    ...(children.length > 0 ? { children } : {}),
                };
            });
    };

    return buildTree(items);
};

export function getAllParentPaths(
    tree: TreeNodeData[],
    itemPath: string,
    level = 0,
): string[] {
    const [head, ...rest] = itemPath.split('.');
    const node = tree.find(
        (n) => n.value.split('.').slice(level).join('.') === head,
    );
    if (!node) return [];
    if (!node.children || rest.length === 0) return [node.value];

    return [
        node.value,
        ...getAllParentPaths(node.children, rest.join('.'), level + 1),
    ];
}
