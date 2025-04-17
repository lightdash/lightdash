import {
    ActionIcon,
    Group,
    MantineProvider,
    Tree as MantineTree,
    Paper,
    Text,
    useTree,
    type RenderTreeNodePayload,
} from '@lightdash/mantine-v7';
// FIXME: this won't scale. figure out how to include required mantine 7 styles.
import '@lightdash/mantine-v7/style.css';
import {
    IconCheck,
    IconChevronDown,
    IconChevronRight,
    IconFolder,
} from '@tabler/icons-react';
import React, { useEffect, useMemo } from 'react';

import MantineIcon from '../MantineIcon';

import classes from './Tree.module.css';
import { type NestableItem } from './types';
import { convertNestableListToTree, getAllParentPaths } from './utils';

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
            <Paper
                component={Group}
                miw="200px"
                maw="300px"
                gap={5}
                wrap="nowrap"
                h="32"
                px="sm"
                radius="md"
                bg={selected ? 'blue.0' : 'transparent'}
                style={{ overflow: 'hidden' }}
                onClick={() => tree.toggleSelected(node.value)}
            >
                {hasChildren && (
                    <ActionIcon
                        className={classes.actionIcon}
                        onClick={(e) => {
                            e.stopPropagation();
                            tree.toggleExpanded(node.value);
                        }}
                        size="xs"
                        variant="transparent"
                    >
                        <MantineIcon
                            icon={expanded ? IconChevronDown : IconChevronRight}
                            size="lg"
                        />
                    </ActionIcon>
                )}

                <MantineIcon
                    icon={IconFolder}
                    color="gray.7"
                    size="lg"
                    stroke={1.5}
                    style={{ flexShrink: 0 }}
                />

                <Text inline truncate="end" style={{ flexGrow: 1 }}>
                    {node.label}
                </Text>

                {selected && (
                    <MantineIcon
                        icon={IconCheck}
                        size="lg"
                        color="blue.6"
                        style={{ flexShrink: 0 }}
                    />
                )}
            </Paper>
        </div>
    );
};

type Props = {
    data: NestableItem[];
    value: string | null;
    onChange: (selectedUuid: string | null) => void;
};

const Tree: React.FC<Props> = ({ value, data, onChange }) => {
    const treeData = useMemo(() => convertNestableListToTree(data), [data]);

    const item = useMemo(() => {
        if (!value) return null;

        return data.find((i) => i.uuid === value) ?? null;
    }, [value, data]);

    const initialSelectedState = useMemo(() => {
        if (!item) return [];

        return [item.path];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const initialExpandedState = useMemo(() => {
        if (!item) return {};

        const allParentPaths = getAllParentPaths(treeData, item.path);

        return allParentPaths.reduce<Record<string, boolean>>((acc, path) => {
            return { ...acc, [path]: true };
        }, {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const tree = useTree({
        initialSelectedState,
        initialExpandedState,
    });

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
            <MantineTree
                data={treeData}
                tree={tree}
                levelOffset={23}
                renderNode={renderTreeNode}
                allowRangeSelection={false}
                checkOnSpace={false}
                clearSelectionOnOutsideClick={false}
                expandOnClick={false}
                expandOnSpace={false}
                selectOnClick={false}
                classNames={{
                    label: classes.label,
                }}
            />
        </MantineProvider>
    );
};

// FIXME: remove this once it's used somewhere else
// ts-unused-exports:disable-next-line
export default Tree;
