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
import React, { FC, useCallback, useMemo, useState } from 'react';
import { useTableTabStyles } from '../../../hooks/styles/useTableTabStyles';
import MantineIcon from '../MantineIcon';
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
    infoTooltipText?: string;
    sort?: (a: ResourceViewItem, b: ResourceViewItem) => number;
    filter?: (item: ResourceViewItem, index: number) => boolean;
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
    defaultActiveTab?: string;
}

const ResourceView: FC<ResourceViewProps> = ({
    view = ResourceViewType.LIST,
    items: allItems,
    maxItems,
    tabs,
    gridProps = {},
    listProps = {},
    headerProps = {},
    emptyStateProps = {},
    hasReorder = false,
    defaultActiveTab,
}) => {
    const theme = useMantineTheme();
    const tableTabStyles = useTableTabStyles();

    const [action, setAction] = useState<ResourceViewItemActionState>({
        type: ResourceViewItemAction.CLOSE,
    });

    const handleAction = useCallback(
        (newAction: ResourceViewItemActionState) => {
            setAction(newAction);
        },
        [],
    );

    const itemsByTabs = useMemo(() => {
        return new Map(
            tabs?.map((tab) => [
                tab.id,
                allItems
                    .filter(tab.filter ?? (() => true))
                    .sort(tab.sort ?? (() => 0))
                    .slice(0, maxItems),
            ]),
        );
    }, [tabs, allItems, maxItems]);

    const [activeTabId, setActiveTabId] = useState(
        defaultActiveTab ??
            [...itemsByTabs.entries()].find(
                ([_tabId, items]) => items.length > 0,
            )?.[0] ??
            tabs?.[0]?.id,
    );

    const sortProps =
        tabs && tabs?.length > 0 && allItems.length > 1
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

    const hasTabs = tabs && tabs.length > 0 && allItems.length > 0;
    const hasHeader = headerProps && (headerProps.title || headerProps.action);

    if (hasTabs && headerProps.title) {
        throw new Error(
            'Cannot have both tabs and a header title. Please use one or the other.',
        );
    }

    const items =
        hasTabs && activeTabId ? itemsByTabs.get(activeTabId) ?? [] : allItems;

    return (
        <>
            <Paper withBorder sx={{ overflow: 'hidden' }}>
                {hasTabs || hasHeader ? (
                    <>
                        <Group>
                            {hasTabs ? (
                                <Tabs
                                    classNames={tableTabStyles.classes}
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
                                                rightSection={
                                                    !!tab.infoTooltipText ? (
                                                        <Tooltip
                                                            label={
                                                                tab.infoTooltipText
                                                            }
                                                            disabled={
                                                                !tab.infoTooltipText
                                                            }
                                                        >
                                                            <MantineIcon
                                                                icon={
                                                                    IconInfoCircle
                                                                }
                                                                color="gray.6"
                                                            />
                                                        </Tooltip>
                                                    ) : null
                                                }
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

                {items.length === 0 ? (
                    <ResourceEmptyState {...emptyStateProps} />
                ) : view === ResourceViewType.LIST ? (
                    <ResourceViewList
                        items={items}
                        {...sortProps}
                        defaultColumnVisibility={
                            listProps.defaultColumnVisibility
                        }
                        onAction={handleAction}
                    />
                ) : view === ResourceViewType.GRID ? (
                    <ResourceViewGrid
                        items={items}
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
