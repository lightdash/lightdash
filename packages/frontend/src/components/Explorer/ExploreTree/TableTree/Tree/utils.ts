import {
    getItemId,
    isCustomDimension,
    isDimension,
    isField,
    type GroupType,
} from '@lightdash/common';
import Fuse from 'fuse.js';
import { MAX_GROUP_DEPTH } from './constants';
import {
    isGroupNode,
    type GroupNode,
    type Node,
    type NodeItem,
    type NodeMap,
} from './types';

export const getSearchResults = (
    itemsMap: Record<string, NodeItem>,
    searchQuery?: string,
): string[] => {
    if (!searchQuery || searchQuery === '') {
        return [];
    }

    return new Fuse(Object.entries(itemsMap), {
        keys: ['1.label', '1.groupLabel'],
        ignoreLocation: true,
        threshold: 0.3,
    })
        .search(searchQuery)
        .map((res) => res.item[0]);
};

const isBaseDimensionWithIntervalDefined = (item: NodeItem): boolean => {
    return isDimension(item) && item.isIntervalBase === true;
};

const createNodeWithGroup = (
    existingNode: NodeMap,
    item: Node,
    groups: string[],
    groupDetails: Record<string, GroupType>,
    isLegacyInterval: boolean,
): NodeMap => {
    if (groups.length === 0) {
        return {
            ...existingNode,
            [item.key]: item,
        };
    }

    const [head, ...tail] = groups;
    const groupDefinition = groupDetails[head] || {
        label: head,
    };

    const groupLabel = groupDefinition.label;

    // Create or retrieve the group node
    const existingGroupNode: NodeMap[string] | undefined =
        existingNode[groupLabel];

    if (existingGroupNode && !isGroupNode(existingGroupNode)) {
        throw new Error('Existing group node is not a group node');
    }

    const groupNode =
        existingGroupNode ||
        ({
            key: groupLabel,
            label: groupLabel,
            description: groupDefinition.description ?? '',
            children: {},
            index: item.index ?? Number.MAX_SAFE_INTEGER,
        } satisfies GroupNode);

    // Process children based on conditions
    const updatedChildren: NodeMap =
        isLegacyInterval && tail.length === 0
            ? {
                  ...(groupNode.children || {}),
                  [item.key]: item,
              }
            : createNodeWithGroup(
                  groupNode.children || {},
                  item,
                  tail,
                  groupDetails,
                  isLegacyInterval,
              );

    // Create updated group node
    const updatedGroupNode: GroupNode = {
        ...groupNode,
        children: updatedChildren,
    };

    // Return updated node map with the updated group
    return {
        ...existingNode,
        [groupLabel]: updatedGroupNode,
    };
};

export const getNodeMapFromItemsMap = (
    itemsMap: Record<string, NodeItem>,
    groupDetails: Record<string, GroupType> = {},
): NodeMap => {
    // Filter items: only include non-hidden items and all custom dimensions
    const filteredItems = Object.entries(itemsMap).filter(([_itemId, item]) =>
        isCustomDimension(item) ? true : !item.hidden,
    );

    // Use reduce to build the node map without mutations
    return filteredItems.reduce<NodeMap>((acc, [itemId, item]) => {
        // Create the node
        const node: Node = isCustomDimension(item)
            ? {
                  key: itemId,
                  label: item.name,
                  index: Number.MAX_SAFE_INTEGER,
              }
            : {
                  key: itemId,
                  label: item.label || item.name,
                  index: item.index ?? Number.MAX_SAFE_INTEGER,
              };

        // For non-field items, simply add to the root
        if (!isField(item)) {
            return {
                ...acc,
                [node.key]: node,
            };
        }

        // Skip base dimensions with interval defined
        if (isBaseDimensionWithIntervalDefined(item)) {
            return acc;
        }

        // Gather groups
        let groups: string[] = [...(item.groups || [])];

        // Handle legacy cases
        let isLegacyInterval = false;

        if (item.groupLabel) {
            groups.push(item.groupLabel);
        }

        if (isDimension(item) && item.group) {
            const groupName = getItemId({
                table: item.table,
                name: item.group,
            });
            groups.push(groupName);
            isLegacyInterval = true;
        }

        // Limit group nesting depth
        const groupsWithMaxDepth = groups.slice(0, MAX_GROUP_DEPTH);
        if (
            groups.length > MAX_GROUP_DEPTH &&
            isDimension(item) &&
            item.timeInterval
        ) {
            // Append time interval group
            groupsWithMaxDepth.push(groups[groups.length - 1]);
        }

        // Add node to the appropriate group(s)
        return createNodeWithGroup(
            acc,
            node,
            groupsWithMaxDepth,
            groupDetails,
            isLegacyInterval,
        );
    }, {});
};
