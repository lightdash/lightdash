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
const isBaseDimensionWithIntervalDefined = (item: Item): boolean => {
    if (isDimension(item) && item.intervalBase) {
        return item.intervalBase;
    } else {
        return false;
    }
};
const addNodeToGroup = (
    node: NodeMap,
    item: Node,
    groups: GroupType[],
): void => {
    if (groups.length === 0) {
        node[item.key] = item;
    } else {
        const [head, ...tail] = groups;
        if (!node[head.label]) {
            node[head.label] = {
                key: head.label,
                label: head.label,
                description: head.description,
                children: {},
                index: item.index ?? Number.MAX_SAFE_INTEGER,
            };
        }
        let children = node[head.label].children;
        if (children) {
            addNodeToGroup(children, item, tail);
        }
    }
};

const getNodeMapFromItemsMap = (
    itemsMap: Record<string, Item>,
    selectedItems: Set<string>,
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
                const groups: GroupType[] = item.groups || [];
                if (!isBaseDimensionWithIntervalDefined(item)) {
                    addNodeToGroup(root, node, groups);
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
    ...rest
}) => {
    const nodeMap = getNodeMapFromItemsMap(itemsMap, selectedItems);
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
