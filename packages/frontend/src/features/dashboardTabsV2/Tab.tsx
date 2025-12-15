import { Draggable } from '@hello-pangea/dnd';
import type { DashboardTab } from '@lightdash/common';
import { ActionIcon, Menu, Tabs, Tooltip } from '@mantine-8/core';
import {
    IconCopy,
    IconDotsVertical,
    IconGripVertical,
    IconPencil,
    IconTrash,
} from '@tabler/icons-react';
import { type Dispatch, type FC, type SetStateAction } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useIsTruncated } from '../../hooks/useIsTruncated';

type DraggableTabProps = {
    idx: number;
    tab: DashboardTab;
    isEditMode: boolean;
    sortedTabs: DashboardTab[];
    currentTabHasTiles: boolean;
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
    setEditingTab,
    handleDeleteTab,
    handleDuplicateTab,
    setDeletingTab,
}) => {
    const { ref, isTruncated } = useIsTruncated('span');

    return (
        <Draggable key={tab.uuid} draggableId={tab.uuid} index={idx}>
            {(provided) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                >
                    <Tooltip
                        label={tab.name}
                        withinPortal
                        position="top"
                        withArrow
                        openDelay={500}
                        color="dark"
                        variant="xs"
                        disabled={!isTruncated}
                        maw={300}
                        multiline
                    >
                        <Tabs.Tab
                            ref={ref}
                            key={idx}
                            value={tab.uuid}
                            maw={`calc(${100 / (sortedTabs?.length || 1)}vw)`}
                            styles={{
                                tabSection: {
                                    flexShrink: 0,
                                },
                            }}
                            leftSection={
                                isEditMode ? (
                                    <ActionIcon
                                        {...provided.dragHandleProps}
                                        variant="subtle"
                                        size="xs"
                                        color="gray"
                                    >
                                        <MantineIcon
                                            size="md"
                                            icon={IconGripVertical}
                                        />
                                    </ActionIcon>
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
                                            <ActionIcon
                                                color="gray"
                                                variant="subtle"
                                                size="xs"
                                            >
                                                <MantineIcon
                                                    icon={IconDotsVertical}
                                                />
                                            </ActionIcon>
                                        </Menu.Target>
                                        <Menu.Dropdown>
                                            <Menu.Item
                                                onClick={() =>
                                                    setEditingTab(true)
                                                }
                                                leftSection={
                                                    <IconPencil size={14} />
                                                }
                                            >
                                                Rename Tab
                                            </Menu.Item>
                                            <Menu.Item
                                                onClick={() =>
                                                    handleDuplicateTab(tab.uuid)
                                                }
                                                leftSection={
                                                    <IconCopy size={14} />
                                                }
                                            >
                                                Duplicate Tab
                                            </Menu.Item>
                                            {sortedTabs.length === 1 ||
                                            !currentTabHasTiles ? (
                                                <Menu.Item
                                                    onClick={(
                                                        e: React.MouseEvent<HTMLButtonElement>,
                                                    ) => {
                                                        handleDeleteTab(
                                                            tab.uuid,
                                                        );
                                                        e.stopPropagation();
                                                    }}
                                                    color="red"
                                                    leftSection={
                                                        <IconTrash size={14} />
                                                    }
                                                >
                                                    Remove Tab
                                                </Menu.Item>
                                            ) : (
                                                <Menu.Item
                                                    onClick={() =>
                                                        setDeletingTab(true)
                                                    }
                                                    color="red"
                                                    leftSection={
                                                        <IconTrash size={14} />
                                                    }
                                                >
                                                    Safely Remove Tab
                                                </Menu.Item>
                                            )}
                                        </Menu.Dropdown>
                                    </Menu>
                                ) : null
                            }
                        >
                            {tab.name}
                        </Tabs.Tab>
                    </Tooltip>
                </div>
            )}
        </Draggable>
    );
};

export default DraggableTab;
