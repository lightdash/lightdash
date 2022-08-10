import {
    AdditionalMetric,
    Dimension,
    Field,
    fieldId,
    isDimension,
    isField,
    Metric,
} from '@lightdash/common';
import Fuse from 'fuse.js';
import React, { createContext, FC, useContext } from 'react';
import { GroupNode, Node, NodeMap } from './index';

const getNodeMapFromFields = (
    items: Record<string, Field | AdditionalMetric>,
    selectedItems: Set<string>,
    searchQuery?: string,
): NodeMap => {
    if (searchQuery && searchQuery !== '') {
        items = new Fuse(Object.entries(items), {
            keys: ['1.label'],
            ignoreLocation: true,
            threshold: 0.3,
        })
            .search(searchQuery)
            .reduce((acc, res) => ({ ...acc, [res.item[0]]: res.item[1] }), {});
    }
    return Object.entries(items)
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
};

const Context = createContext<TableTreeContext | undefined>(undefined);

export const TableTreeProvider: FC<Props> = ({
    searchQuery,
    children,
    itemsMap,
    selectedItems,
    ...rest
}) => {
    const nodeMap = getNodeMapFromFields(itemsMap, selectedItems, searchQuery);
    const isSearching = !!searchQuery && searchQuery !== '';
    return (
        <Context.Provider
            value={{
                itemsMap,
                nodeMap,
                selectedItems,
                isSearching,
                searchQuery,
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
