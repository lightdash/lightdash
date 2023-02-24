import { Tooltip2 } from '@blueprintjs/popover2';
import { assertUnreachable } from '@lightdash/common';
import { Box, Button, Group, Paper } from '@mantine/core';
import React, { useCallback, useMemo, useState } from 'react';
import ResourceActionHandlers, {
    ResourceViewItemAction,
    ResourceViewItemActionState,
} from './ResourceActionHandlers';
import { ResourceViewItem, ResourceViewItemType } from './resourceTypeUtils';
import {
    ResourceEmptyStateWrapper,
    ResourceTag,
    ResourceTitle,
    ResourceViewHeader,
    ResourceViewSpacer,
} from './ResourceView.styles';
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
    headerIcon?: JSX.Element;
    headerIconTooltipContent?: string;
    headerAction?: React.ReactNode;
    items: ResourceViewItem[];
    tabs?: TabType[];
    groups?: GroupType[];
    maxItems?: number;
    showCount?: boolean;
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
    headerIcon,
    headerIconTooltipContent,
    headerAction,
    enableSorting,
    enableMultiSort,
    defaultSort,
    defaultColumnVisibility,
    showCount = true,
    maxItems,
    renderEmptyState,
}) => {
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
                {tabs && tabs?.length > 0 ? null : headerTitle ||
                  headerAction ? (
                    <ResourceViewHeader>
                        {headerTitle && (
                            <ResourceTitle>{headerTitle}</ResourceTitle>
                        )}
                        {headerIcon && (
                            <Tooltip2
                                content={headerIconTooltipContent || ''}
                                disabled={!headerIconTooltipContent}
                            >
                                {headerIcon}
                            </Tooltip2>
                        )}
                        {showCount && slicedSortedItems.length > 0 && (
                            <ResourceTag round>
                                {slicedSortedItems.length}
                            </ResourceTag>
                        )}

                        <ResourceViewSpacer />

                        {headerAction}
                    </ResourceViewHeader>
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
