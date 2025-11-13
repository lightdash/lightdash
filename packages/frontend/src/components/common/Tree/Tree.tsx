import {
    Box,
    Tree as MantineTree,
    rem,
    type TreeNodeData,
    useTree,
} from '@mantine-8/core';
import isEqual from 'lodash/isEqual';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';

import { type FuzzyMatches } from '../../../hooks/useFuzzySearch';
import TreeItem from './TreeItem';
import { type NestableItem } from './types';
import { type FuzzyFilteredItem } from './useFuzzyTreeSearch';
import { convertNestableListToTree, getAllParentPaths } from './utils';

import classes from './Tree.module.css';

type Data<T> = T | FuzzyFilteredItem<T> | FuzzyFilteredItem<FuzzyMatches<T>>;

type Props =
    | {
          withRootSelectable?: boolean;
          topLevelLabel: string;
          isExpanded: boolean;
          data: Data<NestableItem>[];
      } & (
          | {
                type: 'single';
                value: string | null;
                onChange: (selectedUuid: string | null) => void;
            }
          | {
                type: 'multiple';
                values: string[];
                onChangeMultiple: (selectedUuids: string[]) => void;
            }
      );

type TreeController = ReturnType<typeof useTree>;

function recursivelyToggleSelected(
    tree: TreeController,
    node: TreeNodeData,
    selected: boolean,
) {
    if (!selected) {
        tree.select(node.value);
    } else {
        tree.deselect(node.value);
    }

    if (node.children && node.children.length > 0) {
        node.children.forEach((child) => {
            recursivelyToggleSelected(tree, child, selected);
        });
    }
}

const Tree: React.FC<Props> = (props) => {
    const {
        withRootSelectable = true,
        type,
        topLevelLabel,
        isExpanded,
        data,
    } = props;

    const treeData = useMemo(() => convertNestableListToTree(data), [data]);

    const values = useMemo(
        () =>
            props.type === 'multiple'
                ? props.values
                : props.value
                ? [props.value]
                : [],
        [
            props.type,
            // @ts-expect-error - props.values and props.value are only defined if type is 'multiple' or 'single'
            props.values,
            // @ts-expect-error - props.values and props.value are only defined if type is 'multiple' or 'single'
            props.value,
        ],
    );

    const handleChange = useCallback(
        (selectedUuids: string[]) => {
            if (type === 'multiple') {
                props.onChangeMultiple(selectedUuids);
                return;
            }

            props.onChange(selectedUuids.length > 0 ? selectedUuids[0] : null);
        },
        [type, props],
    );

    const items = useMemo(() => {
        return data.filter((i) => values.includes(i.uuid));
    }, [values, data]);

    const initialSelectedState = useMemo(() => {
        return items.map((item) => item.path);
        // WARNING: this is to get an initial state, so we don't need to re-run this
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const tree = useTree({
        initialSelectedState,
        multiple: type === 'multiple',
    });

    /**
     * Prevents infinite loops between bidirectional state sync effects.
     * When true, the external sync effect (values → tree) will skip its update.
     * This is set by the internal sync effect (tree → values) before calling onChange.
     */
    const isInternalUpdate = useRef(false);

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
        items.forEach(expandAllParentPaths);
    }, [items, expandAllParentPaths]);

    useEffect(() => {
        if (isExpanded) {
            tree.expandAllNodes();
        }
        // WARNING: does not need to be re-run every time tree ref changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isExpanded]);

    /**
     * External → Internal sync: Updates tree state when values prop changes externally.
     * This handles cases like form resets, "Clear selection" clicks, or parent component updates.
     * Skips updates that originated from tree interactions to prevent feedback loops.
     */
    useEffect(() => {
        if (isInternalUpdate.current) {
            isInternalUpdate.current = false;
            return;
        }

        const expectedPaths = values
            .map((uuid) => {
                const item = data.find((i) => i.uuid === uuid);
                return item?.path;
            })
            .filter((path): path is string => path !== undefined);

        if (!isEqual(new Set(tree.selectedState), new Set(expectedPaths))) {
            tree.setSelectedState(expectedPaths);
        }
        // WARNING: does not need to be re-run every time tree ref changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [values, data]);

    /**
     * Internal → External sync: Propagates tree selection changes to parent via onChange.
     * This fires when users click nodes in the tree. Sets isInternalUpdate flag to prevent
     * the external sync effect from immediately undoing this change.
     */
    useEffect(() => {
        const uuids = tree.selectedState
            .map((path) => {
                const item = data.find((i) => i.path === path);
                if (item) {
                    return item.uuid;
                }
                return null;
            })
            .filter((item) => item !== null);

        if (!isEqual(uuids, values)) {
            isInternalUpdate.current = true;
            handleChange(uuids);
        }
    }, [tree.selectedState, handleChange, data, values]);

    const handleSelectTopLevel = useCallback(() => {
        if (withRootSelectable) {
            tree.clearSelected();
        }
    }, [withRootSelectable, tree]);

    return (
        <Box px="sm" py="xs">
            <TreeItem
                withRootSelectable={withRootSelectable}
                selected={values.length === 0}
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
                                    onClick={() => {
                                        if (type === 'multiple') {
                                            recursivelyToggleSelected(
                                                tree,
                                                node,
                                                selected,
                                            );
                                            if (!expanded) {
                                                nTree.expand(node.value);
                                            }
                                            return;
                                        }

                                        nTree.toggleSelected(node.value);
                                    }}
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
