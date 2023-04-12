import { assertUnreachable, ResourceViewItem } from '@lightdash/common';
import {
    Box,
    Divider,
    Group,
    Paper,
    Tabs,
    Text,
    Title,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import React, { useCallback, useMemo, useState } from 'react';
import ResourceActionHandlers, {
    ResourceViewItemAction,
    ResourceViewItemActionState,
} from './ResourceActionHandlers';
import ResourceEmptyState, {
    ResourceEmptyStateProps,
} from './ResourceEmptyState';
import ResourceViewGrid, {
    ResourceViewGridCommonProps,
} from './ResourceViewGrid';
import ResourceViewList, {
    ResourceViewListCommonProps,
} from './ResourceViewList';

type TabType = {
    id: string;
    name?: string;
    icon?: JSX.Element;
    sort?: (a: ResourceViewItem, b: ResourceViewItem) => number;
    filter?: (item: ResourceViewItem) => boolean;
};

interface ResourceHeaderProps {
    title?: string;
    description?: string;
    action?: React.ReactNode;
}

export interface ResourceViewCommonProps {
    items: ResourceViewItem[];
    tabs?: TabType[];
    maxItems?: number;
    headerProps?: ResourceHeaderProps;
    emptyStateProps?: ResourceEmptyStateProps;
    view?: ResourceViewType;
    hasReorder?: boolean;
}

export enum ResourceViewType {
    LIST = 'list',
    GRID = 'grid',
}

interface ResourceViewProps extends ResourceViewCommonProps {
    listProps?: ResourceViewListCommonProps;
    gridProps?: ResourceViewGridCommonProps;
}

const ResourceView: React.FC<ResourceViewProps> = ({
    view = ResourceViewType.LIST,
    items,
    maxItems,
    tabs,
    gridProps = {},
    listProps = {},
    headerProps = {},
    emptyStateProps = {},
    hasReorder = false,
}) => {
    const theme = useMantineTheme();

    const [action, setAction] = useState<ResourceViewItemActionState>({
        type: ResourceViewItemAction.CLOSE,
    });

    const [activeTabId, setActiveTabId] = useState(tabs?.[0]?.id);

    const handleAction = useCallback(
        (newAction: ResourceViewItemActionState) => {
            setAction(newAction);
        },
        [],
    );

    const slicedSortedItems = useMemo(() => {
        let sortedItems = items;

        const activeTab = tabs?.find((tab) => tab.id === activeTabId);
        if (activeTab && activeTab.sort) {
            sortedItems = items.sort(activeTab.sort);
        }

        if (activeTab && activeTab.filter) {
            sortedItems = sortedItems.filter(activeTab.filter);
        }

        return maxItems ? sortedItems.slice(0, maxItems) : sortedItems;
    }, [items, activeTabId, maxItems, tabs]);

    const sortProps =
        tabs && tabs?.length > 0 && items.length > 1
            ? {
                  enableSorting: false,
                  enableMultiSort: false,
                  defaultSort: undefined,
              }
            : {
                  enableSorting: listProps.enableSorting,
                  enableMultiSort: listProps.enableMultiSort,
                  defaultSort: listProps.defaultSort,
              };

    const hasTabs = tabs && tabs.length > 0 && items.length > 1;
    const hasHeader = headerProps && (headerProps.title || headerProps.action);

    if (hasTabs && headerProps.title) {
        throw new Error(
            'Cannot have both tabs and a header title. Please use one or the other.',
        );
    }

    return (
        <>
            <Paper withBorder sx={{ overflow: 'hidden' }}>
                {hasTabs || hasHeader ? (
                    <>
                        <Group>
                            {hasTabs ? (
                                <Tabs
                                    styles={{
                                        tab: {
                                            borderRadius: 0,
                                            height: 50,
                                            padding: '0 20px',
                                        },
                                        tabsList: {
                                            borderBottom: 'none',
                                        },
                                    }}
                                    sx={{ flexGrow: 1 }}
                                    value={activeTabId}
                                    onTabChange={(t: string) =>
                                        setActiveTabId(t)
                                    }
                                >
                                    <Tabs.List>
                                        {tabs.map((tab) => (
                                            <Tabs.Tab
                                                key={tab.id}
                                                icon={tab.icon}
                                                value={tab.id}
                                            >
                                                {tab.name ? (
                                                    <Text
                                                        color="gray.7"
                                                        fz={15}
                                                        fw={500}
                                                    >
                                                        {tab.name}
                                                    </Text>
                                                ) : null}
                                            </Tabs.Tab>
                                        ))}
                                    </Tabs.List>
                                </Tabs>
                            ) : null}

                            {hasHeader ? (
                                <Group
                                    align="center"
                                    h={50}
                                    px="md"
                                    spacing="xs"
                                    sx={{
                                        flexGrow: 1,
                                    }}
                                >
                                    {headerProps?.title ? (
                                        <Title order={5} fw={600}>
                                            {headerProps.title}
                                        </Title>
                                    ) : null}

                                    {headerProps?.description ? (
                                        <Tooltip
                                            withArrow
                                            label={
                                                headerProps.description || ''
                                            }
                                            disabled={!headerProps.description}
                                            position="right"
                                        >
                                            <IconInfoCircle
                                                color={theme.colors.gray[6]}
                                                size={18}
                                            />
                                        </Tooltip>
                                    ) : null}

                                    <Box ml="auto">{headerProps.action}</Box>
                                </Group>
                            ) : null}
                        </Group>

                        <Divider color="gray.3" />
                    </>
                ) : null}

                {slicedSortedItems.length === 0 ? (
                    <ResourceEmptyState {...emptyStateProps} />
                ) : view === ResourceViewType.LIST ? (
                    <ResourceViewList
                        items={slicedSortedItems}
                        {...sortProps}
                        defaultColumnVisibility={
                            listProps.defaultColumnVisibility
                        }
                        onAction={handleAction}
                    />
                ) : view === ResourceViewType.GRID ? (
                    <ResourceViewGrid
                        items={slicedSortedItems}
                        groups={gridProps.groups}
                        onAction={handleAction}
                        hasReorder={hasReorder}
                    />
                ) : (
                    assertUnreachable(view, 'Unknown resource view type')
                )}
            </Paper>

            <ResourceActionHandlers action={action} onAction={handleAction} />
        </>
    );
};

export default ResourceView;
