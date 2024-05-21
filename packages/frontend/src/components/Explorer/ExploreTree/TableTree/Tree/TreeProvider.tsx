import {
    isCustomDimension,
    isDimension,
    isField,
    type AdditionalMetric,
    type CustomDimension,
    type Dimension,
    type GroupType,
    type Metric,
    type OrderFieldsByStrategy,
} from '@lightdash/common';
import Fuse from 'fuse.js';
import { createContext, useContext, type FC } from 'react';

export const getSearchResults = (
    itemsMap: Record<string, Item>,
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
const removeBaseDimensionNode = (
    item: Dimension,
    group: string,
    root: NodeMap,
    groupLabel?: string,
): void => {
    if (groupLabel) {
        const newRoot = root[groupLabel].children || {};
        removeBaseDimensionNode(item, group, newRoot);
    }
    Object.entries(root).forEach(([key, node]) => {
        if (node.label === group) {
            delete root[key];
        }
    });
};
const isBaseDimensionWithIntervalDefined = (item: Item): boolean => {
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
        if (children) {
            addNodeToGroup(children, item, tail, groupDetails);
        }
    }
};

const getNodeMapFromItemsMap = (
    itemsMap: Record<string, Item>,
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
            if (isField(item)) {
                const groups: string[] = item.groups || [];
                if (item.groupLabel) {
                    groups.push(item.groupLabel);
                }
                if (isDimension(item) && item.group) {
                    // We need to clean the baseDimensionNode
                    removeBaseDimensionNode(
                        item,
                        item.group,
                        root,
                        item.groupLabel,
                    );
                    groups.push(item.group);
                }
                const tableGroupDetails = groupDetails || {};
                if (!isBaseDimensionWithIntervalDefined(item)) {
                    addNodeToGroup(root, node, groups, tableGroupDetails);
                }
            } else {
                root[node.key] = node;
            }
        });

    return root;
};

export type Node = {
    key: string;
    label: string;
    index: number;
    children?: NodeMap;
    description?: string;
};

export type GroupNode = Required<Node>;

export type NodeMap = Record<string, Node>;

export const isGroupNode = (node: Node): node is GroupNode =>
    'children' in node;

type Item = Dimension | Metric | AdditionalMetric | CustomDimension;

type Props = {
    orderFieldsBy?: OrderFieldsByStrategy;
    searchQuery?: string;
    itemsMap: Record<string, Item>;
    selectedItems: Set<string>;
    missingCustomMetrics?: AdditionalMetric[];
    missingCustomDimensions?: CustomDimension[];
    groupDetails?: Record<string, GroupType>;
    onItemClick: (key: string, item: Item) => void;
};

type TableTreeContext = Props & {
    nodeMap: NodeMap;
    isSearching: boolean;
    searchResults: Set<string>;
};

const Context = createContext<TableTreeContext | undefined>(undefined);

export const TreeProvider: FC<React.PropsWithChildren<Props>> = ({
    searchQuery,
    children,
    itemsMap,
    selectedItems,
    missingCustomMetrics,
    missingCustomDimensions,
    groupDetails,
    ...rest
}) => {
    const nodeMap = getNodeMapFromItemsMap(
        itemsMap,
        selectedItems,
        groupDetails,
    );
    const searchResults = getSearchResults(itemsMap, searchQuery);
    const isSearching = !!searchQuery && searchQuery !== '';
    return (
        <Context.Provider
            value={{
                itemsMap,
                nodeMap,
                selectedItems,
                isSearching,
                searchQuery,
                searchResults,
                missingCustomMetrics,
                missingCustomDimensions,
                ...rest,
            }}
        >
            {children}
        </Context.Provider>
    );
};

export function useTableTreeContext(): TableTreeContext {
    const context = useContext(Context);
    if (context === undefined) {
        throw new Error(
            'useTableTreeContext must be used within a TableTreeProvider',
        );
    }
    return context;
}
