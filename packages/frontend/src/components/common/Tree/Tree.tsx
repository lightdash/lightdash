import {
    ActionIcon,
    Group,
    MantineProvider,
    Tree as MantineTree,
    Paper,
    ScrollArea,
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
import { convertNestableListToTree } from './utils';

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
    onSelect: (selectedUuid: string | null) => void;
};

const Tree: React.FC<Props> = ({ data, onSelect }) => {
    const tree = useTree();

    const treeData = useMemo(() => convertNestableListToTree(data), [data]);

    useEffect(() => {
        onSelect(tree.selectedState[0] ?? null);
    }, [tree.selectedState, onSelect]);

    return (
        <MantineProvider>
            <Paper component={ScrollArea} w="300px" h="500px" withBorder p="sm">
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
            </Paper>
        </MantineProvider>
    );
};

// FIXME: remove this once it's used somewhere else
// ts-unused-exports:disable-next-line
export default Tree;
