import {
    getItemId,
    isCustomDimension,
    isDimension,
    isField,
    type GroupType,
} from '@lightdash/common';
import Fuse from 'fuse.js';
import { MAX_GROUP_DEPTH } from './constants';
import { type Node, type NodeItem, type NodeMap } from './types';

export const getSearchResults = (
    itemsMap: Record<string, NodeItem>,
    searchQuery?: string,
): Set<string> => {
    const results = new Set<string>();
    if (searchQuery && searchQuery !== '') {
        new Fuse(Object.entries(itemsMap), {
            keys: ['1.label', '1.groupLabel'],
            ignoreLocation: true,
            threshold: 0.3,
        })
            .search(searchQuery)
            .forEach((res) => results.add(res.item[0]));
    }
    return results;
};
const isBaseDimensionWithIntervalDefined = (item: NodeItem): boolean => {
    if (isDimension(item) && item.isIntervalBase) {
        return item.isIntervalBase;
    } else {
        return false;
    }
};

const addNodeToGroup = (
    node: NodeMap,
    item: Node,
    groups: string[],
    groupDetails: Record<string, GroupType>,
    isLegacyInterval: boolean,
): void => {
    if (groups.length === 0) {
        node[item.key] = item;
    } else {
        const [head, ...tail] = groups;
        const groupDefinition = groupDetails[head] || {
            label: head,
        };

        if (!node[groupDefinition.label]) {
            node[groupDefinition.label] = {
                key: groupDefinition.label,
                label: groupDefinition.label,
                description: groupDefinition.description,
                children: {},
                index: item.index ?? Number.MAX_SAFE_INTEGER,
            };
        }
        let children = node[groupDefinition.label].children;
        if (isLegacyInterval && tail.length === 0) {
            /*
             * This is a dimension time interval from deprecated legacy cached model
             */
            node[groupDefinition.label].children = {
                ...(children || {}),
                [item.key]: item,
            };
        } else if (children) {
            addNodeToGroup(
                children,
                item,
                tail,
                groupDetails,
                isLegacyInterval,
            );
        }
    }
};

export const getNodeMapFromItemsMap = (
    itemsMap: Record<string, NodeItem>,
    selectedItems: Set<string>,
    groupDetails?: Record<string, GroupType>,
): NodeMap => {
    const root: NodeMap = {};
    Object.entries(itemsMap)
        .filter(([itemId, item]) =>
            isCustomDimension(item)
                ? true
                : !item.hidden || selectedItems.has(itemId),
        )
        .forEach(([itemId, item]) => {
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
            let isLegacyInterval = false;
            if (isField(item)) {
                const groups: string[] = item.groups || [];
                /*
                 * Deprecated groupLabel and group properties
                 * will only have values for legacy cached models
                 */
                if (item.groupLabel) {
                    groups.push(item.groupLabel);
                }
                if (isDimension(item) && item.group) {
                    // We need to clean the baseDimensionNode
                    const groupName = getItemId({
                        table: item.table,
                        name: item.group,
                    });
                    groups.push(groupName);
                    isLegacyInterval = true;
                }
                const tableGroupDetails = groupDetails || {};

                if (!isBaseDimensionWithIntervalDefined(item)) {
                    // Limit group nesting levels
                    const groupsWithMaxDepth = groups.slice(0, MAX_GROUP_DEPTH);
                    if (
                        groups.length > MAX_GROUP_DEPTH &&
                        isDimension(item) &&
                        item.timeInterval
                    ) {
                        // append time interval group
                        groupsWithMaxDepth.push(groups[groups.length - 1]);
                    }

                    addNodeToGroup(
                        root,
                        node,
                        groupsWithMaxDepth,
                        tableGroupDetails,
                        isLegacyInterval,
                    );
                }
            } else {
                root[node.key] = node;
            }
        });
    return root;
};
