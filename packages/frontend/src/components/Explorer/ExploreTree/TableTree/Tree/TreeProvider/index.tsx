import {
    AdditionalMetric,
    CustomDimension,
    Dimension,
    fieldId,
    isCustomDimension,
    isDimension,
    isField,
    Metric,
    OrderFieldsByStrategy,
} from '@lightdash/common';
import { createContext, FC } from 'react';
import { getSearchResults } from './utils/getSearchResults';

const getNodeMapFromItemsMap = (
    itemsMap: Record<string, Item>,
    selectedItems: Set<string>,
): NodeMap => {
    return (
        Object.entries(itemsMap)
            //TODO better filter for custom dimensions ?
            .filter(([itemId, item]) =>
                isCustomDimension(item)
                    ? true
                    : !item.hidden || selectedItems.has(itemId),
            )
            .reduce<NodeMap>((acc, [itemId, item]) => {
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
                if (isField(item) && item.groupLabel) {
                    // first in group
                    if (!acc[item.groupLabel]) {
                        const groupNode: GroupNode = {
                            key: item.groupLabel,
                            label: item.groupLabel,
                            children: { [node.key]: node },
                            index: item.index ?? Number.MAX_SAFE_INTEGER,
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
            }, {})
    );
};

export type Node = {
    key: string;
    label: string;
    index: number;
    children?: NodeMap;
};

export type GroupNode = Required<Node>;

export type NodeMap = Record<string, Node>;

type Item = Dimension | Metric | AdditionalMetric | CustomDimension;

type Props = {
    orderFieldsBy?: OrderFieldsByStrategy;
    searchQuery?: string;
    itemsMap: Record<string, Item>;
    selectedItems: Set<string>;
    missingCustomMetrics?: AdditionalMetric[];
    onItemClick: (key: string, item: Item) => void;
};

export type TableTreeContext = Props & {
    nodeMap: NodeMap;
    isSearching: boolean;
    searchResults: Set<string>;
};

export const Context = createContext<TableTreeContext | undefined>(undefined);

export const TreeProvider: FC<Props> = ({
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
