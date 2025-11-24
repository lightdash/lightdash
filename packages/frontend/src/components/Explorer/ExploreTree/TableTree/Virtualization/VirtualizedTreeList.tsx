import { MantineProvider, type MantineTheme } from '@mantine/core';
import type { Range } from '@tanstack/react-virtual';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import { memo, useCallback, useMemo, useRef, type FC } from 'react';
import type { FlattenedTreeData } from './types';
import VirtualTreeItem from './VirtualTreeItem';

interface VirtualizedTreeListProps {
    data: FlattenedTreeData;
    onToggleTable: (tableName: string) => void;
    onToggleGroup: (groupKey: string) => void;
    onSelectedFieldChange: (fieldId: string, isDimension: boolean) => void;
}

const themeOverride = {
    components: {
        NavLink: {
            styles: (theme: MantineTheme) => ({
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
};

/**
 * Virtualized tree list using @tanstack/react-virtual
 * Renders only visible items for optimal performance
 */
const VirtualizedTreeListComponent: FC<VirtualizedTreeListProps> = ({
    data,
    onToggleTable,
    onToggleGroup,
    onSelectedFieldChange,
}) => {
    const { items, sectionContexts } = data;
    const parentRef = useRef<HTMLDivElement>(null);
    const activeStickyIndexRef = useRef(0);

    // Find all table header indexes for sticky positioning
    const stickyIndexes = useMemo(
        () =>
            items
                .map((item, index) =>
                    item.type === 'table-header' ? index : -1,
                )
                .filter((index) => index !== -1),
        [items],
    );

    const isSticky = useCallback(
        (index: number) => stickyIndexes.includes(index),
        [stickyIndexes],
    );

    const isActiveSticky = useCallback(
        (index: number) => activeStickyIndexRef.current === index,
        [],
    );

    // Custom range extractor to always include the active sticky header
    const rangeExtractor = useCallback(
        (range: Range) => {
            // Find the active sticky header (last header before or at current position)
            const foundStickyIndex = [...stickyIndexes]
                .reverse()
                .find((index) => range.startIndex >= index);

            // Only set and include sticky header if one exists
            if (foundStickyIndex !== undefined) {
                activeStickyIndexRef.current = foundStickyIndex;
                const next = new Set([
                    foundStickyIndex,
                    ...defaultRangeExtractor(range),
                ]);
                return [...next].sort((a, b) => a - b);
            }

            // No sticky headers exist or we're before the first one
            activeStickyIndexRef.current = -1;
            return defaultRangeExtractor(range);
        },
        [stickyIndexes],
    );

    // Setup virtualizer with custom range extractor
    const virtualizer = useVirtualizer({
        count: items.length,
        getScrollElement: () => parentRef.current,
        estimateSize: (index) => items[index].estimatedHeight,
        overscan: 5, // Render 5 extra items above and below viewport
        rangeExtractor,
    });

    const virtualItems = virtualizer.getVirtualItems();

    return (
        <MantineProvider inherit theme={themeOverride}>
            <div
                ref={parentRef}
                data-testid="virtualized-tree-scroll-container"
                style={{
                    height: '100%',
                    overflow: 'auto',
                }}
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
                        const isStickyItem = isSticky(virtualItem.index);
                        const isActiveStickyItem = isActiveSticky(
                            virtualItem.index,
                        );

                        return (
                            <div
                                key={item.id}
                                data-index={virtualItem.index}
                                style={{
                                    ...(isStickyItem
                                        ? {
                                              zIndex: 1,
                                          }
                                        : {}),
                                    ...(isActiveStickyItem
                                        ? {
                                              position: 'sticky',
                                          }
                                        : {
                                              position: 'absolute',
                                              transform: `translateY(${virtualItem.start}px)`,
                                          }),
                                    top: 0,
                                    left: 0,
                                    width: '100%',
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
            </div>
        </MantineProvider>
    );
};

const VirtualizedTreeList = memo(VirtualizedTreeListComponent);
VirtualizedTreeList.displayName = 'VirtualizedTreeList';

export default VirtualizedTreeList;
