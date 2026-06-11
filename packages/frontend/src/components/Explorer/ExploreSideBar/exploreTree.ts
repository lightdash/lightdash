import { type GroupType, type SummaryExplore } from '@lightdash/common';

const MAX_EXPLORE_GROUP_DEPTH = 3;

export type ExploreLeafNode = {
    type: 'explore';
    key: string; // explore name
    label: string;
    explore: SummaryExplore;
};

export type ExploreGroupNode = {
    type: 'group';
    key: string; // raw group key
    label: string;
    description?: string;
    path: string; // full path used for expansion state
    children: ExploreNodeMap;
};

export type ExploreNode = ExploreLeafNode | ExploreGroupNode;

export type ExploreNodeMap = Record<string, ExploreNode>;

const PATH_SEPARATOR = '/';

const buildPath = (parentPath: string, key: string): string =>
    parentPath ? `${parentPath}${PATH_SEPARATOR}${key}` : key;

const resolveGroupLabel = (
    key: string,
    groupDetails: Record<string, GroupType>,
): { label: string; description?: string } => {
    const detail = groupDetails[key];
    if (detail) {
        return { label: detail.label, description: detail.description };
    }
    return { label: key };
};

// Mutates `nodeMap`. Tree is constructed fresh per `buildExploreTree` call,
// so there's no shared-state concern — and avoiding immutable spreads makes
// insertion O(depth) instead of O(n) per explore.
const insertExploreIntoTree = (
    nodeMap: ExploreNodeMap,
    explore: SummaryExplore,
    groups: string[],
    groupDetails: Record<string, GroupType>,
    parentPath: string,
): void => {
    if (groups.length === 0) {
        nodeMap[explore.name] = {
            type: 'explore',
            key: explore.name,
            label: explore.label || explore.name,
            explore,
        };
        return;
    }

    const [head, ...tail] = groups;
    const existing = nodeMap[head];

    // Collision: an explore already lives at this key. Drop grouping for this
    // explore and add at the current level (mirrors field tree behaviour).
    if (existing && existing.type === 'explore') {
        nodeMap[explore.name] = {
            type: 'explore',
            key: explore.name,
            label: explore.label || explore.name,
            explore,
        };
        return;
    }

    let groupNode: ExploreGroupNode;
    if (existing && existing.type === 'group') {
        groupNode = existing;
    } else {
        const { label, description } = resolveGroupLabel(head, groupDetails);
        groupNode = {
            type: 'group',
            key: head,
            label,
            description,
            path: buildPath(parentPath, head),
            children: {},
        };
        nodeMap[head] = groupNode;
    }

    insertExploreIntoTree(
        groupNode.children,
        explore,
        tail,
        groupDetails,
        groupNode.path,
    );
};

const getExploreGroups = (explore: SummaryExplore): string[] => {
    if (explore.groups && explore.groups.length > 0) {
        return explore.groups.slice(0, MAX_EXPLORE_GROUP_DEPTH);
    }
    if (explore.groupLabel) {
        return [explore.groupLabel];
    }
    return [];
};

export const buildExploreTree = (
    explores: SummaryExplore[],
    tableGroupDetails: Record<string, GroupType> = {},
): ExploreNodeMap => {
    const tree: ExploreNodeMap = {};
    for (const explore of explores) {
        insertExploreIntoTree(
            tree,
            explore,
            getExploreGroups(explore),
            tableGroupDetails,
            '',
        );
    }
    return tree;
};

const sortNodes = (a: ExploreNode, b: ExploreNode): number => {
    // Groups first, then explores, each alphabetised.
    if (a.type !== b.type) {
        return a.type === 'group' ? -1 : 1;
    }
    return a.label.localeCompare(b.label);
};

// Sorts in place and returns the same node references so iteration order
// (Object.values / for..in) follows insertion order. Groups are mutated to
// reorder their `children` map.
const sortNodeMapInPlace = (nodeMap: ExploreNodeMap): ExploreNode[] => {
    const sorted = Object.values(nodeMap).sort(sortNodes);
    // Reset insertion order on the original map.
    for (const node of sorted) {
        delete nodeMap[node.key];
    }
    for (const node of sorted) {
        nodeMap[node.key] = node;
        if (node.type === 'group') {
            sortNodeMapInPlace(node.children);
        }
    }
    return sorted;
};

export const sortExploreTree = (nodeMap: ExploreNodeMap): ExploreNode[] =>
    sortNodeMapInPlace(nodeMap);

/**
 * Walk the tree and collect the paths of every group whose subtree contains
 * a matching explore (by name). Used to auto-expand groups when the user
 * searches.
 */
export const collectMatchingGroupPaths = (
    nodeMap: ExploreNodeMap,
    matchingExploreNames: Set<string>,
): Set<string> => {
    const matches = new Set<string>();
    const visit = (nodes: ExploreNodeMap): boolean => {
        let found = false;
        for (const node of Object.values(nodes)) {
            if (node.type === 'explore') {
                if (matchingExploreNames.has(node.key)) {
                    found = true;
                }
            } else {
                const childMatch = visit(node.children);
                if (childMatch) {
                    matches.add(node.path);
                    found = true;
                }
            }
        }
        return found;
    };
    visit(nodeMap);
    return matches;
};

/**
 * Same as `collectMatchingGroupPaths` but operates on a pre-sorted array
 * of root nodes — saves rebuilding a Record for the caller.
 */
export const collectMatchingGroupPathsFromArray = (
    rootNodes: ExploreNode[],
    matchingExploreNames: Set<string>,
): Set<string> => {
    const matches = new Set<string>();
    const visit = (nodes: Iterable<ExploreNode>): boolean => {
        let found = false;
        for (const node of nodes) {
            if (node.type === 'explore') {
                if (matchingExploreNames.has(node.key)) {
                    found = true;
                }
            } else {
                const childMatch = visit(Object.values(node.children));
                if (childMatch) {
                    matches.add(node.path);
                    found = true;
                }
            }
        }
        return found;
    };
    visit(rootNodes);
    return matches;
};
