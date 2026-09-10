import {
    Box,
    Tree as MantineTree,
    rem,
    useTree,
    type TreeNodeData,
} from '@mantine/core';
import isEqual from 'lodash/isEqual';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { type FuzzyMatches } from '../../../hooks/useFuzzySearch';
import classes from './Tree.module.css';
import TreeItem from './TreeItem';
import { type NestableItem } from './types';
import { type FuzzyFilteredItem } from './useFuzzyTreeSearch';
import {
    collectTreeValues,
    convertNestableListToTree,
    getAllParentPaths,
} from './utils';

type Data<T> = T | FuzzyFilteredItem<T> | FuzzyFilteredItem<FuzzyMatches<T>>;

type Props = {
    /** Anchor name for scope walkthroughs, set on every node with its label as data-tour-value. */
    nodeTourAnchor?: string;
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

// Tree setters replace the whole selection from the current render, so a
// node and its descendants have to be toggled in a single update.
function toggleSubtreeSelected(
    tree: TreeController,
    node: TreeNodeData,
    selected: boolean,
) {
    const subtree = collectTreeValues([node]);
    tree.setSelectedState(
        selected
            ? tree.selectedState.filter((value) => !subtree.includes(value))
            : Array.from(new Set([...tree.selectedState, ...subtree])),
    );
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

    // Build a map for O(1) lookups in renderNode instead of O(n) .find() calls
    const dataByPath = useMemo(() => {
        const map = new Map<string, Data<NestableItem>>();
        for (const item of data) {
            map.set(item.path, item);
        }
        return map;
    }, [data]);

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

    // Build a map for O(1) lookups by uuid
    const dataByUuid = useMemo(() => {
        const map = new Map<string, Data<NestableItem>>();
        for (const item of data) {
            map.set(item.uuid, item);
        }
        return map;
    }, [data]);

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

    // Tree setters replace the whole expanded state from the current render,
    // so every path is merged into a single update.
    const withAncestorsExpanded = useCallback(
        (base: Record<string, boolean>) => ({
            ...base,
            ...Object.fromEntries(
                items
                    .flatMap((item) => getAllParentPaths(treeData, item.path))
                    .map((path) => [path, true]),
            ),
        }),
        [items, treeData],
    );

    useEffect(() => {
        tree.setExpandedState(withAncestorsExpanded(tree.expandedState));
        // WARNING: does not need to be re-run every time tree ref changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [withAncestorsExpanded]);

    useEffect(() => {
        const everyNode = collectTreeValues(treeData);
        if (isExpanded) {
            tree.setExpandedState(
                Object.fromEntries(everyNode.map((value) => [value, true])),
            );
        } else {
            // Mantine keeps expanded keys across data changes, so collapse
            // explicitly and reopen only the selected items' ancestors.
            tree.setExpandedState(
                withAncestorsExpanded(
                    Object.fromEntries(
                        everyNode.map((value) => [value, false]),
                    ),
                ),
            );
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
            .map((uuid) => dataByUuid.get(uuid)?.path)
            .filter((path): path is string => path !== undefined);

        if (!isEqual(new Set(tree.selectedState), new Set(expectedPaths))) {
            tree.setSelectedState(expectedPaths);
        }
        // WARNING: does not need to be re-run every time tree ref changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [values, dataByUuid]);

    /**
     * Internal → External sync: Propagates tree selection changes to parent via onChange.
     * This fires when users click nodes in the tree. Sets isInternalUpdate flag to prevent
     * the external sync effect from immediately undoing this change.
     */
    useEffect(() => {
        const uuids = tree.selectedState
            .map((path) => dataByPath.get(path)?.uuid ?? null)
            .filter((item) => item !== null);

        if (!isEqual(uuids, values)) {
            isInternalUpdate.current = true;
            handleChange(uuids);
        }
    }, [tree.selectedState, handleChange, dataByPath, values]);

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
                        const nodeItem = dataByPath.get(node.value);

                        if (!nodeItem) {
                            throw new Error(
                                `Item with path ${node.value} not found`,
                            );
                        }

                        const highlights =
                            '_fuzzyMatches' in nodeItem
                                ? nodeItem._fuzzyMatches
                                : [];

                        const isRestricted = nodeItem.restricted === true;

                        return (
                            <div
                                {...elementProps}
                                // Scope-tour anchors: a click path may name a
                                // node by its label, e.g.
                                // [data-tour-anchor="space-option"][data-tour-value="Shared"]
                                data-tour-anchor={props.nodeTourAnchor}
                                data-tour-value={
                                    props.nodeTourAnchor &&
                                    typeof node.label === 'string'
                                        ? node.label
                                        : undefined
                                }
                            >
                                <TreeItem
                                    expanded={expanded}
                                    selected={selected}
                                    label={node.label}
                                    matchHighlights={highlights}
                                    hasChildren={hasChildren}
                                    restricted={isRestricted}
                                    onClick={() => {
                                        if (isRestricted) return;

                                        if (type === 'multiple') {
                                            toggleSubtreeSelected(
                                                tree,
                                                node,
                                                selected,
                                            );
                                            if (!expanded) {
                                                nTree.expand(node.value);
                                            }
                                            return;
                                        }

                                        // A single required choice cannot
                                        // be clicked away: re-clicking the
                                        // selected node keeps it selected.
                                        if (type === 'single' && selected) {
                                            return;
                                        }
                                        // toggleSelected no longer commits
                                        // single-select state in Mantine 9.
                                        nTree.select(node.value);
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
