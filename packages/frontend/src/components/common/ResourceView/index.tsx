import { assertUnreachable } from '@lightdash/common';
import {
    Box,
    Divider,
    Group,
    Paper,
    Tabs,
    Text,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../MantineIcon';
import ResourceActionHandlers from './ResourceActionHandlers';
import ResourceEmptyState from './ResourceEmptyState';
import ResourceViewGrid, {
    type ResourceViewGridCommonProps,
} from './ResourceViewGrid';
import ResourceViewList, {
    type ResourceViewListCommonProps,
} from './ResourceViewList';
import {
    ResourceViewItemAction,
    ResourceViewType,
    type ResourceViewCommonProps,
    type ResourceViewItemActionState,
} from './types';

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
        hasTabs && activeTabId
            ? (itemsByTabs.get(activeTabId) ?? [])
            : allItems;

    return (
        <>
            <Paper withBorder>
                {hasTabs || hasHeader ? (
                    <>
                        <Group>
                            {hasTabs ? (
                                <Tabs
                                    flex={1}
                                    value={activeTabId}
                                    onChange={(t) =>
                                        setActiveTabId(t ?? undefined)
                                    }
                                >
                                    <Tabs.List bd="none">
                                        {tabs.map((tab) => (
                                            <Tabs.Tab
                                                key={tab.id}
                                                leftSection={tab.icon}
                                                value={tab.id}
                                                h="4xl"
                                                px="lg"
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
                                                                color="ldGray.9"
                                                            />
                                                        </Tooltip>
                                                    ) : null
                                                }
                                            >
                                                {tab.name ? (
                                                    <Text
                                                        c="ldGray.9"
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
                                    gap="xs"
                                    flex={1}
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
                                            <MantineIcon
                                                icon={IconInfoCircle}
                                                color="ldGray.6"
                                                size={18}
                                            />
                                        </Tooltip>
                                    ) : null}

                                    <Box ml="auto">{headerProps.action}</Box>
                                </Group>
                            ) : null}
                        </Group>

                        <Divider color="ldGray.3" />
                    </>
                ) : null}

                {items.length === 0 ? (
                    <ResourceEmptyState
                        {...emptyStateProps}
                        {...(hasTabs && activeTabId
                            ? tabs.find((t) => t.id === activeTabId)
                                  ?.emptyStateProps
                            : {})}
                    />
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
