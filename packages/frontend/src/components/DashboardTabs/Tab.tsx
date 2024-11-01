import { Draggable } from '@hello-pangea/dnd';
import type { DashboardTab } from '@lightdash/common';
import { ActionIcon, Box, Menu, Tabs, Title } from '@mantine/core';
import { mergeRefs, useHover } from '@mantine/hooks';
import {
    IconDots,
    IconGripVertical,
    IconPencil,
    IconTrash,
} from '@tabler/icons-react';
import type { FC } from 'react';
import MantineIcon from '../common/MantineIcon';

type DraggableTabProps = {
    idx: number;
    tab: DashboardTab;
    isEditMode: boolean;
    sortedTabs: DashboardTab[];
    currentTabHasTiles: boolean;
    isActive: boolean;
    setEditingTab: (value: React.SetStateAction<boolean>) => void;
    setDeletingTab: (value: React.SetStateAction<boolean>) => void;
    handleDeleteTab: (tabUuid: string) => void;
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
    setDeletingTab,
}) => {
    const { hovered: isHovered, ref: hoverRef } = useHover();

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
                        mr="xs"
                        bg={isActive ? 'white' : 'var(--mantine-color-gray-0)'}
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
                                    width={200}
                                >
                                    <Menu.Target>
                                        <ActionIcon variant="subtle" size="xs">
                                            <MantineIcon
                                                icon={IconDots}
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
                                        {sortedTabs.length === 1 ||
                                        !currentTabHasTiles ? (
                                            <Menu.Item
                                                onClick={(e) => {
                                                    handleDeleteTab(tab.uuid);
                                                    e.stopPropagation();
                                                }}
                                                color="red"
                                                icon={<IconTrash size={14} />}
                                            >
                                                {sortedTabs.length === 1
                                                    ? 'Remove Tabs Component'
                                                    : 'Remove Tab'}
                                            </Menu.Item>
                                        ) : (
                                            <Menu.Item
                                                onClick={() =>
                                                    setDeletingTab(true)
                                                }
                                                color="red"
                                                icon={<IconTrash size={14} />}
                                            >
                                                Remove Tab
                                            </Menu.Item>
                                        )}
                                    </Menu.Dropdown>
                                </Menu>
                            ) : null
                        }
                    >
                        <Title order={6} fw={500} color="gray.7">
                            {tab.name}
                        </Title>
                    </Tabs.Tab>
                </div>
            )}
        </Draggable>
    );
};

export default DraggableTab;
