import { Box, Tree as MantineTree, rem, useTree } from '@mantine-8/core';
import React, { useCallback, useEffect, useMemo } from 'react';

import { type FuzzyMatches } from '../../../hooks/useFuzzySearch';
import TreeItem from './TreeItem';
import { type NestableItem } from './types';
import { type FuzzyFilteredItem } from './useFuzzyTreeSearch';
import { convertNestableListToTree, getAllParentPaths } from './utils';

import classes from './Tree.module.css';

type Data<T> = T | FuzzyFilteredItem<T> | FuzzyFilteredItem<FuzzyMatches<T>>;

type Props = {
    withRootSelectable?: boolean;
    topLevelLabel: string;
    isExpanded: boolean;
    data: Data<NestableItem>[];
    value: string | null;
    onChange: (selectedUuid: string | null) => void;
};

const Tree: React.FC<Props> = ({
    withRootSelectable = true,
    topLevelLabel,
    isExpanded,
    value,
    data,
    onChange,
}) => {
    const treeData = useMemo(() => convertNestableListToTree(data), [data]);

    const item = useMemo(() => {
        if (!value) return null;

        return data.find((i) => i.uuid === value) ?? null;
    }, [value, data]);

    const initialSelectedState = useMemo(() => {
        if (!item) return [];
        return [item.path];
        // WARNING: this is to get an initial state, so we don't need to re-run this
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const tree = useTree({
        initialSelectedState,
    });

    const expandAllParentPaths = useCallback(
        (node: NestableItem) => {
            const allParentPaths = getAllParentPaths(treeData, node.path);

            allParentPaths.forEach((path) => {
                tree.expand(path);
            });
        },
        // WARNING: does not need to be re-created every time tree ref changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [treeData],
    );

    useEffect(() => {
        if (item) {
            expandAllParentPaths(item);
        }
    }, [item, expandAllParentPaths]);

    useEffect(() => {
        if (isExpanded) {
            tree.expandAllNodes();
        }
        // WARNING: does not need to be re-run every time tree ref changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isExpanded]);

    useEffect(() => {
        let uuid: string | null = null;

        if (tree.selectedState.length === 0) {
            uuid = null;
        } else {
            const path = tree.selectedState[0];
            uuid = data.find((i) => i.path === path)?.uuid ?? null;
        }

        if (uuid !== value) {
            onChange(uuid);
        }
    }, [tree.selectedState, onChange, data, value]);

    const handleSelectTopLevel = useCallback(() => {
        if (withRootSelectable) {
            tree.clearSelected();
        }
    }, [withRootSelectable, tree]);

    return (
        <Box px="sm" py="xs">
            <TreeItem
                withRootSelectable={withRootSelectable}
                selected={!value}
                label={topLevelLabel}
                isRoot={true}
                onClick={handleSelectTopLevel}
            />

            <Box ml={rem(6)} pl={rem(13.5)}>
                <MantineTree
                    data={treeData}
                    tree={tree}
                    levelOffset={rem(23)}
                    renderNode={({
                        node,
                        selected,
                        expanded,
                        hasChildren,
                        elementProps,
                        tree: nTree,
                    }) => {
                        const nodeItem = data.find(
                            (i) => i.path === node.value,
                        );

                        if (!nodeItem) {
                            throw new Error(
                                `Item with uuid ${node.value} not found`,
                            );
                        }

                        const highlights =
                            '_fuzzyMatches' in nodeItem
                                ? nodeItem._fuzzyMatches
                                : [];

                        return (
                            <div {...elementProps}>
                                <TreeItem
                                    expanded={expanded}
                                    selected={selected}
                                    label={node.label}
                                    matchHighlights={highlights}
                                    hasChildren={hasChildren}
                                    onClick={() =>
                                        nTree.toggleSelected(node.value)
                                    }
                                    onClickExpand={() =>
                                        nTree.toggleExpanded(node.value)
                                    }
                                />
                            </div>
                        );
                    }}
                    allowRangeSelection={false}
                    checkOnSpace={false}
                    clearSelectionOnOutsideClick={false}
                    expandOnClick={false}
                    expandOnSpace={false}
                    selectOnClick={false}
                    classNames={{
                        node: classes.node,
                        label: classes.label,
                    }}
                />
            </Box>
        </Box>
    );
};

export default Tree;
