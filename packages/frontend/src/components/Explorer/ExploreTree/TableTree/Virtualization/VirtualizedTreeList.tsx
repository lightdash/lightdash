import { MantineProvider } from '@mantine/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useRef, type FC } from 'react';
import { getMantineThemeOverride } from '../../../../../mantineTheme';
import type { FlattenedTreeData } from './types';
import VirtualTreeItem from './VirtualTreeItem';

interface VirtualizedTreeListProps {
    data: FlattenedTreeData;
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
 * Virtualized tree list using @tanstack/react-virtual
 * Renders only visible items for optimal performance
 */
const VirtualizedTreeListComponent: FC<VirtualizedTreeListProps> = ({
    data,
}) => {
    const { items, sectionContexts } = data;
    const parentRef = useRef<HTMLDivElement>(null);

    // Setup virtualizer
    const virtualizer = useVirtualizer({
        count: items.length,
        getScrollElement: () => parentRef.current,
        estimateSize: (index) => items[index].estimatedHeight,
        overscan: 5, // Render 5 extra items above and below viewport
    });

    const virtualItems = virtualizer.getVirtualItems();

    return (
        <MantineProvider inherit theme={themeOverride}>
            <div
                ref={parentRef}
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
                        return (
                            <div
                                key={virtualItem.key}
                                data-index={virtualItem.index}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    transform: `translateY(${virtualItem.start}px)`,
                                }}
                            >
                                <VirtualTreeItem
                                    item={item}
                                    sectionContexts={sectionContexts}
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
