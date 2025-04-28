import { type TreeNodeData } from '@mantine-8/core';
import { type NestableItem } from './types';

export const convertNestableListToTree = (
    items: NestableItem[],
): TreeNodeData[] => {
    const buildTree = (
        nodes: NestableItem[],
        parentPath = '',
    ): TreeNodeData[] => {
        return nodes
            .filter((item) => {
                const pathParts = item.path.split('.');
                const itemParentPath = pathParts.slice(0, -1).join('.');
                return itemParentPath === parentPath;
            })
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
