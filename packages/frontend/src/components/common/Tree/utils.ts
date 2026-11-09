import { type TreeNodeData } from '@mantine/core';
import { type NestableItem } from './types';

/**
 * Maps each item to its nearest ancestor in the list. Uses parentSpaceUuid;
 * falls back to the path only when the parent is hidden and the match is unique.
 */
export const getParentUuids = (
    items: NestableItem[],
): Map<string, string | null> => {
    const uuids = new Set(items.map((item) => item.uuid));
    const uuidsByPath = new Map<string, string[]>();
    for (const item of items) {
        uuidsByPath.set(item.path, [
            ...(uuidsByPath.get(item.path) ?? []),
            item.uuid,
        ]);
    }

    const findPathAncestor = (path: string): string | null => {
        const parts = path.split('.');
        for (let depth = parts.length - 1; depth > 0; depth -= 1) {
            const matches = uuidsByPath.get(parts.slice(0, depth).join('.'));
            if (matches) return matches.length === 1 ? matches[0] : null;
        }
        return null;
    };

    const parents = new Map<string, string | null>();
    for (const item of items) {
        if (item.parentSpaceUuid === null) {
            parents.set(item.uuid, null);
        } else if (uuids.has(item.parentSpaceUuid)) {
            parents.set(item.uuid, item.parentSpaceUuid);
        } else {
            parents.set(item.uuid, findPathAncestor(item.path));
        }
    }

    // Break cycles from inconsistent data so every item stays reachable.
    const acyclic = new Set<string>();
    for (const item of items) {
        const chain = new Set<string>();
        let current: string | null = item.uuid;
        while (current !== null && !acyclic.has(current)) {
            if (chain.has(current)) {
                parents.set(current, null);
                break;
            }
            chain.add(current);
            current = parents.get(current) ?? null;
        }
        chain.forEach((uuid) => acyclic.add(uuid));
    }

    return parents;
};

export const convertNestableListToTree = (
    items: NestableItem[],
): TreeNodeData[] => {
    const parents = getParentUuids(items);
    const nodeMap = new Map<string, TreeNodeData>();
    for (const item of items) {
        nodeMap.set(item.uuid, {
            label: item.name,
            value: item.uuid,
            nodeProps: { uuid: item.uuid },
        });
    }

    const roots: TreeNodeData[] = [];
    for (const item of items) {
        const node = nodeMap.get(item.uuid)!;
        const parentUuid = parents.get(item.uuid);
        const parentNode = parentUuid ? nodeMap.get(parentUuid) : undefined;
        if (parentNode) {
            parentNode.children ??= [];
            parentNode.children.push(node);
        } else {
            roots.push(node);
        }
    }

    return roots;
};

/** The uuid and its ancestors' uuids, root first. Empty if unknown. */
export const getAncestorUuids = (
    parents: Map<string, string | null>,
    uuid: string,
): string[] => {
    if (!parents.has(uuid)) return [];
    const chain: string[] = [];
    let current: string | null = uuid;
    while (current !== null && !chain.includes(current)) {
        chain.unshift(current);
        current = parents.get(current) ?? null;
    }
    return chain;
};

export const collectTreeValues = (tree: TreeNodeData[]): string[] =>
    tree.flatMap((node) => [
        node.value,
        ...collectTreeValues(node.children ?? []),
    ]);
