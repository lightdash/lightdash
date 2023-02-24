import { assertUnreachable } from '@lightdash/common';
import {
    Box,
    Button,
    Divider,
    Group,
    Paper,
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
import { ResourceViewItem, ResourceViewItemType } from './resourceTypeUtils';
import { ResourceEmptyStateWrapper } from './ResourceView.styles';
import ResourceViewGrid from './ResourceViewGrid';
import ResourceViewList, {
    ResourceViewListCommonProps,
} from './ResourceViewList';

type TabType = {
    id: string;
    name: string;
    icon?: JSX.Element;
    sort?: (a: ResourceViewItem, b: ResourceViewItem) => number;
};

type GroupType = ResourceViewItemType[];

export interface ResourceViewCommonProps {
    headerTitle?: string;
    headerDescription?: string;
    headerAction?: React.ReactNode;
    items: ResourceViewItem[];
    tabs?: TabType[];
    groups?: GroupType[];
    maxItems?: number;
    renderEmptyState?: () => React.ReactNode;
    view?: ResourceViewType;
}

export enum ResourceViewType {
    LIST = 'list',
    GRID = 'grid',
}

type ResourceViewProps = ResourceViewCommonProps & ResourceViewListCommonProps;

const ResourceView: React.FC<ResourceViewProps> = ({
    view = ResourceViewType.LIST,
    items,
    tabs,
    groups,
    headerTitle,
    headerDescription,
    headerAction,
    enableSorting,
    enableMultiSort,
    defaultSort,
    defaultColumnVisibility,
    maxItems,
    renderEmptyState,
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

        return maxItems ? sortedItems.slice(0, maxItems) : sortedItems;
    }, [items, activeTabId, maxItems, tabs]);

    const sortProps =
        tabs && tabs?.length > 0
            ? {
                  enableSorting: false,
                  enableMultiSort: false,
                  defaultSort: undefined,
              }
            : {
                  enableSorting,
                  enableMultiSort,
                  defaultSort,
              };

    return (
        <Box>
            {tabs && tabs?.length > 0 ? (
                <Group spacing="xs" mb="md">
                    {tabs.map((tab) => (
                        <Button
                            key={tab.id}
                            leftIcon={tab.icon}
                            variant={
                                tab.id === activeTabId ? 'light' : 'subtle'
                            }
                            color={tab.id === activeTabId ? 'blue.9' : 'none'}
                            onClick={() => setActiveTabId(tab.id)}
                        >
                            {tab.name}
                        </Button>
                    ))}
                </Group>
            ) : null}

            <Paper withBorder sx={{ overflow: 'hidden' }}>
                {headerTitle || headerAction ? (
                    <>
                        <Group align="center" h={50} px="md" spacing="xs">
                            {headerTitle && (
                                <Title order={5} fw={600}>
                                    {headerTitle}
                                </Title>
                            )}

                            {headerDescription && (
                                <Tooltip
                                    withArrow
                                    label={headerDescription || ''}
                                    disabled={!headerDescription}
                                    position="right"
                                >
                                    <IconInfoCircle
                                        color={theme.colors.gray[6]}
                                        size={18}
                                    />
                                </Tooltip>
                            )}

                            <Box ml="auto">{headerAction}</Box>
                        </Group>

                        <Divider color="gray.3" />
                    </>
                ) : null}

                {slicedSortedItems.length === 0 ? (
                    !!renderEmptyState ? (
                        <ResourceEmptyStateWrapper>
                            {renderEmptyState()}
                        </ResourceEmptyStateWrapper>
                    ) : null
                ) : view === ResourceViewType.LIST ? (
                    <ResourceViewList
                        items={slicedSortedItems}
                        {...sortProps}
                        defaultColumnVisibility={defaultColumnVisibility}
                        onAction={handleAction}
                    />
                ) : view === ResourceViewType.GRID ? (
                    <ResourceViewGrid
                        items={slicedSortedItems}
                        groups={groups}
                        onAction={handleAction}
                    />
                ) : (
                    assertUnreachable(view, 'Unknown resource view type')
                )}
            </Paper>

            <ResourceActionHandlers action={action} onAction={handleAction} />
        </Box>
    );
};

export default ResourceView;
