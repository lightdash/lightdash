import {
    AdditionalMetric,
    Dimension,
    fieldId,
    isDimension,
    isField,
    Metric,
} from '@lightdash/common';
import Fuse from 'fuse.js';
import React, { createContext, FC, useContext } from 'react';

export const getSearchResults = (
    itemsMap: Record<string, Item>,
    searchQuery?: string,
): Set<string> => {
    const results = new Set<string>();
    if (searchQuery && searchQuery !== '') {
        new Fuse(Object.entries(itemsMap), {
            keys: ['1.label'],
            ignoreLocation: true,
            threshold: 0.3,
        })
            .search(searchQuery)
            .forEach((res) => results.add(res.item[0]));
    }
    return results;
};
const getNodeMapFromItemsMap = (
    itemsMap: Record<string, Item>,
    selectedItems: Set<string>,
): NodeMap => {
    return Object.entries(itemsMap)
        .filter(([itemId, item]) => !item.hidden || selectedItems.has(itemId))
        .reduce<NodeMap>((acc, [itemId, item]) => {
            const node: Node = {
                key: itemId,
                label: item.label || item.name,
            };
            if (isField(item) && item.groupLabel) {
                // first in group
                if (!acc[item.groupLabel]) {
                    const groupNode: GroupNode = {
                        key: item.groupLabel,
                        label: item.groupLabel,
                        children: { [node.key]: node },
                    };
                    return { ...acc, [item.groupLabel]: groupNode };
                }

                // child date inside group
                if (isDimension(item) && item.group) {
                    const parentDateId = fieldId({
                        table: item.table,
                        name: item.group,
                    });
                    const parentNode =
                        acc[item.groupLabel]?.children?.[parentDateId];
                    if (!parentNode) {
                        return { ...acc };
                    }

                    return {
                        ...acc,
                        [item.groupLabel]: {
                            ...acc[item.groupLabel],
                            children: {
                                ...acc[item.groupLabel].children,
                                [parentDateId]: {
                                    ...parentNode,
                                    children: {
                                        ...parentNode.children,
                                        [node.key]: node,
                                    },
                                },
                            },
                        },
                    };
                }

                // add to existing group
                return {
                    ...acc,
                    [item.groupLabel]: {
                        ...acc[item.groupLabel],
                        children: {
                            ...acc[item.groupLabel].children,
                            [node.key]: node,
                        },
                    },
                };
            }

            // child date outside group
            if (isDimension(item) && item.group) {
                const parentDateId = fieldId({
                    table: item.table,
                    name: item.group,
                });

                if (!acc[parentDateId]) {
                    return { ...acc };
                }

                return {
                    ...acc,
                    [parentDateId]: {
                        ...acc[parentDateId],
                        children: {
                            ...acc[parentDateId].children,
                            [node.key]: node,
                        },
                    },
                };
            }

            // outside group
            return { ...acc, [node.key]: node };
        }, {});
};

export type Node = {
    key: string;
    label: string;
    children?: NodeMap;
};

export type GroupNode = Required<Node>;

export type NodeMap = Record<string, Node>;

export const isGroupNode = (node: Node): node is GroupNode =>
    'children' in node;

type Item = Dimension | Metric | AdditionalMetric;

type Props = {
    searchQuery?: string;
    itemsMap: Record<string, Item>;
    selectedItems: Set<string>;
    onItemClick: (key: string, item: Item) => void;
};

type TableTreeContext = Props & {
    nodeMap: NodeMap;
    isSearching: boolean;
    searchResults: Set<string>;
};

const Context = createContext<TableTreeContext | undefined>(undefined);

export const TreeProvider: FC<Props> = ({
    searchQuery,
    children,
    itemsMap,
    selectedItems,
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
