import {
    Box,
    MantineProvider,
    Tree as MantineTree,
    rem,
    useTree,
    type RenderTreeNodePayload,
} from '@lightdash/mantine-v7';
// FIXME: this won't scale. figure out how to include required mantine 7 styles.
import '@lightdash/mantine-v7/style.css';
import React, { useCallback, useEffect, useMemo } from 'react';

import TreeItem from './TreeItem';
import { type NestableItem } from './types';
import { convertNestableListToTree, getAllParentPaths } from './utils';

import classes from './Tree.module.css';

const renderTreeNode = ({
    node,
    selected,
    expanded,
    hasChildren,
    elementProps,
    tree,
}: RenderTreeNodePayload) => {
    return (
        <div {...elementProps}>
            <TreeItem
                expanded={expanded}
                selected={selected}
                label={node.label}
                hasChildren={hasChildren}
                onToggleSelect={() => tree.toggleSelected(node.value)}
                onToggleExpand={() => tree.toggleExpanded(node.value)}
            />
        </div>
    );
};

type Props = {
    topLevelLabel: string;
    isExpanded: boolean;
    data: NestableItem[];
    value: string | null;
    onChange: (selectedUuid: string | null) => void;
};

const Tree: React.FC<Props> = ({
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

    return (
        <MantineProvider>
            <Box px="sm" py="xs">
                <TreeItem
                    selected={!value}
                    label={topLevelLabel}
                    isRoot={true}
                />

                <Box ml={rem(6)} pl={rem(13.5)}>
                    <MantineTree
                        data={treeData}
                        tree={tree}
                        levelOffset={rem(23)}
                        renderNode={renderTreeNode}
                        allowRangeSelection={false}
                        checkOnSpace={false}
                        clearSelectionOnOutsideClick={false}
                        expandOnClick={false}
                        expandOnSpace={false}
                        selectOnClick={false}
                        classNames={{
                            label: classes.label,
                            node: classes.node,
                        }}
                    />
                </Box>
            </Box>
        </MantineProvider>
    );
};

export default Tree;
