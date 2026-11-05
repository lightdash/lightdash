import type { DashboardTab } from '@lightdash/common';
import { ActionIcon, Group, Menu, Tabs, Tooltip } from '@mantine/core';
import {
    IconCopy,
    IconDotsVertical,
    IconEye,
    IconEyeOff,
    IconGripVertical,
    IconPencil,
    IconTrash,
} from '@tabler/icons-react';
import clsx from 'clsx';
import {
    type Dispatch,
    type FC,
    type SetStateAction,
    type SyntheticEvent,
} from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { SortableItem } from '../../components/common/Sortable/Sortable';
import { useIsTruncated } from '../../hooks/useIsTruncated';
import styles from './tabs.module.css';

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
    handleToggleTabHidden: (tabUuid: string) => void;
    /** In edit mode: no grip (the tab drags), and one trailing slot whose menu shows on the active, hovered or focused tab. */
    hasQuietActions?: boolean;
};

// The portaled menu bubbles its events here through React: never drag from it
const isInsideTab = (e: SyntheticEvent<HTMLElement>) =>
    e.target instanceof Node && e.currentTarget.contains(e.target);

const DraggableTab: FC<DraggableTabProps> = ({
    tab,
    idx,
    isEditMode,
    sortedTabs,
    currentTabHasTiles,
    setEditingTab,
    handleDeleteTab,
    handleDuplicateTab,
    handleToggleTabHidden,
    setDeletingTab,
    hasQuietActions = false,
}) => {
    // The grip is the tab's first span in edit mode: a quiet tab reads its label
    const { ref, isTruncated } = useIsTruncated(
        hasQuietActions ? '.mantine-Tabs-tabLabel' : 'span',
    );
    const isWholeTabHandle = isEditMode && hasQuietActions;

    return (
        <SortableItem id={tab.uuid} disabled={!isEditMode}>
            {(sortable) => (
                <div
                    // With no grip the whole tab, menu included, is the handle
                    {...(isWholeTabHandle && sortable.handleProps)}
                    ref={(el) => {
                        sortable.ref(el);
                        if (isWholeTabHandle) sortable.handleProps.ref(el);
                    }}
                    className={clsx(
                        sortable.className,
                        isWholeTabHandle && sortable.handleProps.className,
                    )}
                    // oxlint-disable-next-line lightdash-ui/no-inline-style-prop
                    style={sortable.style}
                    onMouseDown={(e) => {
                        if (isWholeTabHandle && isInsideTab(e))
                            sortable.handleProps.onMouseDown(e);
                    }}
                    onTouchStart={(e) => {
                        if (isWholeTabHandle && isInsideTab(e))
                            sortable.handleProps.onTouchStart(e);
                    }}
                    // On the wrapper: it is the tab's first focus stop
                    data-quiet-actions={isWholeTabHandle || undefined}
                    data-dragging={sortable.isDragging || undefined}
                >
                    <Tooltip
                        label={tab.name}
                        position="top"
                        openDelay={500}
                        color="dark"
                        disabled={!isTruncated}
                        maw={300}
                    >
                        <Tabs.Tab
                            ref={ref}
                            key={idx}
                            value={tab.uuid}
                            // A stylesheet may lift the cap; unset, it is a share of the viewport
                            maw={`var(--dashboard-tab-max-width, ${
                                100 / (sortedTabs.length || 1)
                            }vw)`}
                            opacity={isEditMode && tab.hidden ? 0.55 : 1}
                            classNames={{ tabSection: styles.tabSection }}
                            leftSection={
                                // A quiet tab is its own handle: no grip
                                isEditMode && !hasQuietActions ? (
                                    <ActionIcon
                                        {...sortable.handleProps}
                                        size="xs"
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
                                    <Menu position="bottom" withArrow>
                                        <Menu.Target>
                                            <ActionIcon size="xs">
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
                                            <Menu.Item
                                                onClick={() =>
                                                    handleToggleTabHidden(
                                                        tab.uuid,
                                                    )
                                                }
                                                leftSection={
                                                    tab.hidden ? (
                                                        <MantineIcon
                                                            icon={IconEye}
                                                            size={14}
                                                        />
                                                    ) : (
                                                        <MantineIcon
                                                            icon={IconEyeOff}
                                                            size={14}
                                                        />
                                                    )
                                                }
                                            >
                                                {tab.hidden
                                                    ? 'Show Tab'
                                                    : 'Hide Tab'}
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
                            {isEditMode && tab.hidden ? (
                                <Group gap={4} wrap="nowrap">
                                    <MantineIcon icon={IconEyeOff} size="sm" />
                                    <span>{tab.name}</span>
                                </Group>
                            ) : (
                                tab.name
                            )}
                        </Tabs.Tab>
                    </Tooltip>
                </div>
            )}
        </SortableItem>
    );
};

export default DraggableTab;
