import {
    getItemId,
    isCustomDimension,
    isDimension,
    isField,
    OrderFieldsByStrategy,
    type GroupType,
} from '@lightdash/common';
import Fuse from 'fuse.js';
import { MAX_GROUP_DEPTH } from './constants';
import { sortNodes } from './sortNodes';
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
    keys: string[] = ['1.label', '1.groupLabel'],
): string[] => {
    if (!searchQuery || searchQuery === '') {
        return [];
    }

    return new Fuse(Object.entries(itemsMap), {
        keys,
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
    orderFieldsBy: OrderFieldsByStrategy,
    itemsMap: Record<string, NodeItem>,
    groupByKey: boolean,
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
    const groupKey = groupByKey ? JSON.stringify(['group', head]) : groupLabel;

    // Create or retrieve the group node
    const existingGroupNode: NodeMap[string] | undefined =
        existingNode[groupKey];

    // Handle collision: if a field exists with the same key as the group label,
    // skip grouping and add the item at the current level instead
    if (existingGroupNode && !isGroupNode(existingGroupNode)) {
        console.warn(
            `Field "${item.key}" cannot be grouped under "${groupLabel}" because a field with that key already exists. Adding to current level instead.`,
        );
        return {
            ...existingNode,
            [item.key]: item,
        };
    }

    const groupNode =
        existingGroupNode ||
        ({
            key: groupKey,
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
                  orderFieldsBy,
                  itemsMap,
                  groupByKey,
              );

    // Sort children according to orderFieldsBy strategy
    const sortedChildren = Object.values(updatedChildren).sort(
        sortNodes(orderFieldsBy, itemsMap),
    );

    // Convert sorted array back to NodeMap
    const sortedChildrenMap = sortedChildren.reduce<NodeMap>(
        (acc, child) => ({
            ...acc,
            [child.key]: child,
        }),
        {},
    );

    // Create updated group node
    const updatedGroupNode: GroupNode = {
        ...groupNode,
        children: sortedChildrenMap,
    };

    // Return updated node map with the updated group
    return {
        ...existingNode,
        [groupKey]: updatedGroupNode,
    };
};

export const getNodeMapFromItemsMap = (
    itemsMap: Record<string, NodeItem>,
    groupDetails: Record<string, GroupType> = {},
    orderFieldsBy: OrderFieldsByStrategy = OrderFieldsByStrategy.LABEL,
    options: { groupByKey?: boolean; fieldOrder?: Map<string, number> } = {},
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
                  index:
                      options.fieldOrder?.get(itemId) ??
                      Number.MAX_SAFE_INTEGER,
              }
            : {
                  key: itemId,
                  label: item.label || item.name,
                  index:
                      options.fieldOrder?.get(itemId) ??
                      item.index ??
                      Number.MAX_SAFE_INTEGER,
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
            orderFieldsBy,
            itemsMap,
            options.groupByKey ?? false,
        );
    }, {});
};
