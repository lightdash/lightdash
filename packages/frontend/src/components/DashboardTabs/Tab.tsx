import { Draggable } from '@hello-pangea/dnd';
import type { DashboardTab } from '@lightdash/common';
import { ActionIcon, Box, Menu, Tabs, Title, Tooltip } from '@mantine/core';
import { mergeRefs, useHover } from '@mantine/hooks';
import { IconGripVertical, IconDotsVertical, IconPencil, IconTrash, IconCopy } from '@tabler/icons-react';
import { type Dispatch, type FC, type SetStateAction } from 'react';
import { useIsTruncated } from '../../hooks/useIsTruncated';
import MantineIcon from '../common/MantineIcon';

type DraggableTabProps = {
    idx: number;
    tab: DashboardTab;
    isEditMode: boolean;
    sortedTabs: DashboardTab[];
    currentTabHasTiles: boolean;
    isActive: boolean;
    setEditingTab: Dispatch<SetStateAction<boolean>>;
    setDeletingTab: Dispatch<SetStateAction<boolean>>;
    handleDeleteTab: (tabUuid: string) => void;
    handleDuplicateTab: (tabUuid: string) => void;
};

const DraggableTab: FC<DraggableTabProps> = ({
    tab,
    idx,
    isEditMode,
    sortedTabs,
    currentTabHasTiles,
    isActive,
    setEditingTab,
    handleDeleteTab,
    handleDuplicateTab,
    setDeletingTab,
}) => {
    const { hovered: isHovered, ref: hoverRef } = useHover();
    const { ref, isTruncated } = useIsTruncated();

    return (
        <Draggable key={tab.uuid} draggableId={tab.uuid} index={idx}>
            {(provided) => (
                <div
                    ref={mergeRefs(provided.innerRef, hoverRef)}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                >
                    <Tabs.Tab
                        key={idx}
                        value={tab.uuid}
                        bg={isActive ? 'white' : 'gray.0'}
                        icon={
                            isEditMode ? (
                                <Box {...provided.dragHandleProps} w={'sm'}>
                                    <MantineIcon
                                        display={isHovered ? 'block' : 'none'}
                                        size="sm"
                                        color="gray.6"
                                        icon={IconGripVertical}
                                    />
                                </Box>
                            ) : null
                        }
                        rightSection={
                            isEditMode ? (
                                <Menu
                                    position="bottom"
                                    withArrow
                                    withinPortal
                                    shadow="md"
                                >
                                    <Menu.Target>
                                        <ActionIcon variant="subtle" size="xs">
                                            <MantineIcon
                                                icon={IconDotsVertical}
                                                display={
                                                    isHovered ? 'block' : 'none'
                                                }
                                            />
                                        </ActionIcon>
                                    </Menu.Target>
                                    <Menu.Dropdown>
                                        <Menu.Item
                                            onClick={() => setEditingTab(true)}
                                            icon={<IconPencil size={14} />}
                                        >
                                            Rename Tab
                                        </Menu.Item>
                                        <Menu.Item
                                            onClick={() => handleDuplicateTab(tab.uuid)}
                                            icon={<IconCopy size={14} />}
                                        >
                                            Duplicate Tab
                                        </Menu.Item>
                                        {sortedTabs.length === 1 ||
                                        !currentTabHasTiles ? (
                                            <Menu.Item
                                                onClick={(
                                                    e: React.MouseEvent<HTMLButtonElement>,
                                                ) => {
                                                    handleDeleteTab(tab.uuid);
                                                    e.stopPropagation();
                                                }}
                                                color="red"
                                                icon={<IconTrash size={14} />}
                                            >
                                                Remove Tab
                                            </Menu.Item>
                                        ) : (
                                            <Menu.Item
                                                onClick={() =>
                                                    setDeletingTab(true)
                                                }
                                                color="red"
                                                icon={<IconTrash size={14} />}
                                            >
                                                Safely Remove Tab
                                            </Menu.Item>
                                        )}
                                    </Menu.Dropdown>
                                </Menu>
                            ) : null
                        }
                    >
                        <Tooltip
                            disabled={!isTruncated}
                            label={tab.name}
                            withinPortal
                            variant="xs"
                        >
                            <Title
                                ref={ref}
                                order={6}
                                fw={500}
                                color="gray.7"
                                truncate
                                maw={`calc(${
                                    100 / (sortedTabs?.length || 1)
                                }vw)`}
                            >
                                {tab.name}
                            </Title>
                        </Tooltip>
                    </Tabs.Tab>
                </div>
            )}
        </Draggable>
    );
};

export default DraggableTab;
