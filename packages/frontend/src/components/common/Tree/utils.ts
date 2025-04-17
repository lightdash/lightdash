import { type TreeNodeData } from '@lightdash/mantine-v7';
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
                    value: item.uuid,
                    nodeProps: { uuid: item.uuid },
                    ...(children.length > 0 ? { children } : {}),
                };
            });
    };

    return buildTree(items);
};
