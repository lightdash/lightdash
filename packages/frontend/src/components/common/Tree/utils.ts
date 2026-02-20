import { type TreeNodeData } from '@mantine-8/core';
import { type NestableItem } from './types';

export const convertNestableListToTree = (
    items: NestableItem[],
): TreeNodeData[] => {
    const itemPaths = new Set(items.map((item) => item.path));

    // Build a map from path to tree node for O(1) lookups
    const nodeMap = new Map<string, TreeNodeData>();
    for (const item of items) {
        nodeMap.set(item.path, {
            label: item.name,
            value: item.path,
            nodeProps: { uuid: item.uuid },
        });
    }

    const roots: TreeNodeData[] = [];

    // Sort by path depth so parents are processed before children
    const sorted = [...items].sort(
        (a, b) => a.path.split('.').length - b.path.split('.').length,
    );

    for (const item of sorted) {
        const node = nodeMap.get(item.path)!;

        // Walk up path parts to find the nearest ancestor in the items set
        const parts = item.path.split('.');
        let parentNode: TreeNodeData | undefined;
        for (let i = parts.length - 2; i >= 0; i--) {
            const ancestorPath = parts.slice(0, i + 1).join('.');
            if (itemPaths.has(ancestorPath)) {
                parentNode = nodeMap.get(ancestorPath);
                break;
            }
        }

        if (parentNode) {
            if (!parentNode.children) {
                parentNode.children = [];
            }
            parentNode.children.push(node);
        } else {
            roots.push(node);
        }
    }

    return roots;
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
