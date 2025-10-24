import { MantineProvider, ScrollArea, Stack } from '@mantine/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Activity, memo, useRef, type FC } from 'react';
import { getMantineThemeOverride } from '../../../../../mantineTheme';
import { ITEM_HEIGHTS, type GroupedTreeData } from './types';
import VirtualTableHeader from './VirtualTableHeader';
import VirtualTreeItem from './VirtualTreeItem';

interface VirtualizedTreeListProps {
    data: GroupedTreeData;
    onToggleTable: (tableName: string) => void;
    onToggleGroup: (groupKey: string) => void;
    onSelectedFieldChange: (fieldId: string, isDimension: boolean) => void;
}

const themeOverride = getMantineThemeOverride({
    components: {
        NavLink: {
            styles: (theme, _params) => ({
                root: {
                    height: theme.spacing.xxl,
                    padding: `0 ${theme.spacing.sm}`,
                    flexGrow: 0,
                },
                rightSection: {
                    marginLeft: theme.spacing.xxs,
                },
            }),
        },
    },
});

/**
 * Single virtualized table section with sticky header
 */
const VirtualizedTableSection: FC<{
    tableGroup: GroupedTreeData['tables'][number];
    sectionContexts: GroupedTreeData['sectionContexts'];
    onToggleTable: (tableName: string) => void;
    onToggleGroup: (groupKey: string) => void;
    onSelectedFieldChange: (fieldId: string, isDimension: boolean) => void;
}> = ({
    tableGroup,
    sectionContexts,
    onToggleTable,
    onToggleGroup,
    onSelectedFieldChange,
}) => {
    const { tableHeader, items } = tableGroup;
    const parentRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
        count: tableHeader?.isExpanded ? items.length : 0,
        getScrollElement: () => parentRef.current,
        estimateSize: (index) => items[index]?.estimatedHeight ?? 0,
        overscan: 25,
        enabled: tableHeader?.isExpanded,
    });

    const virtualItems = virtualizer.getVirtualItems();

    return (
        <Stack spacing="0" mah="100%">
            {tableHeader && (
                <VirtualTableHeader
                    item={{
                        id: `table-header-${tableHeader.table.name}`,
                        type: 'table-header',
                        estimatedHeight: ITEM_HEIGHTS.TABLE_HEADER,
                        data: tableHeader,
                    }}
                    onToggle={() => onToggleTable(tableHeader.table.name)}
                ></VirtualTableHeader>
            )}
            <Activity mode={tableHeader?.isExpanded ? 'visible' : 'hidden'}>
                <ScrollArea
                    variant="primary"
                    className="only-vertical"
                    offsetScrollbars
                    scrollbarSize={8}
                    viewportRef={parentRef}
                    h="100%"
                >
                    <div
                        style={{
                            height: `${virtualizer.getTotalSize()}px`,
                            width: '100%',
                            position: 'relative',
                        }}
                    >
                        {virtualItems.map((virtualItem) => {
                            const item = items[virtualItem.index];

                            return (
                                <div
                                    key={item.id}
                                    data-index={virtualItem.index}
                                    style={{
                                        position: 'absolute',
                                        width: '100%',
                                        top: virtualItem.start,
                                    }}
                                >
                                    <VirtualTreeItem
                                        item={item}
                                        sectionContexts={sectionContexts}
                                        onToggleTable={onToggleTable}
                                        onToggleGroup={onToggleGroup}
                                        onSelectedFieldChange={
                                            onSelectedFieldChange
                                        }
                                    />
                                </div>
                            );
                        })}
                    </div>
                </ScrollArea>
            </Activity>
        </Stack>
    );
};

/**
 * Virtualized tree list using @tanstack/react-virtual
 * Renders table groups with sticky headers that stick within their own section
 */
const VirtualizedTreeListComponent: FC<VirtualizedTreeListProps> = ({
    data,
    onToggleTable,
    onToggleGroup,
    onSelectedFieldChange,
}) => {
    const { tables, sectionContexts } = data;

    return (
        <MantineProvider inherit theme={themeOverride}>
            <Stack spacing="0" h="100%">
                {tables.map((tableGroup, index) => (
                    <VirtualizedTableSection
                        key={
                            tableGroup.tableHeader?.table.name ??
                            `table-${index}`
                        }
                        tableGroup={tableGroup}
                        sectionContexts={sectionContexts}
                        onToggleTable={onToggleTable}
                        onToggleGroup={onToggleGroup}
                        onSelectedFieldChange={onSelectedFieldChange}
                    />
                ))}
            </Stack>
        </MantineProvider>
    );
};

const VirtualizedTreeList = memo(VirtualizedTreeListComponent);
VirtualizedTreeList.displayName = 'VirtualizedTreeList';

export default VirtualizedTreeList;
