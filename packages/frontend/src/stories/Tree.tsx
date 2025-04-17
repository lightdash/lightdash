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
    type TreeNodeData,
} from '@lightdash/mantine-v7';
import {
    IconCheck,
    IconChevronDown,
    IconChevronRight,
    IconFolder,
} from '@tabler/icons-react';
import React, { useEffect, useMemo } from 'react';
import MantineIcon from '../components/common/MantineIcon';

import '@lightdash/mantine-v7/style.css';
import classes from './Tree.module.css';

type NestableItem = {
    uuid: string;
    name: string;
    path: string;
};

const convertNestableListToTree = (items: NestableItem[]): TreeNodeData[] => {
    const buildTree = (
        nodes: NestableItem[],
        parentPath = '',
    ): TreeNodeData[] => {
        return nodes
            .filter((item) => {
                const pathParts = item.path.split('.');
                const itemParentPath = pathParts.slice(0, -1).join('.');
                return itemParentPath === parentPath;
            })
            .map((item) => {
                const children = buildTree(nodes, item.path);
                return {
                    label: item.name,
                    value: item.uuid,
                    nodeProps: { uuid: item.uuid },
                    ...(children.length > 0 ? { children } : {}),
                };
            });
    };

    return buildTree(items);
};

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

export default Tree;
