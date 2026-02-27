import { type SummaryExplore } from '@lightdash/common';
import { Divider, Text } from '@mantine-8/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useCallback, useMemo, useRef, useState, type FC } from 'react';
import ExploreNavLink from './ExploreNavLink';
import GroupHeader from './GroupHeader';

// Define item types for the virtualized list
export type VirtualListItem =
    | {
          type: 'group-header';
          id: string;
          label: string;
          explores: SummaryExplore[];
          isExpanded: boolean;
      }
    | {
          type: 'explore';
          id: string;
          explore: SummaryExplore;
          groupLabel?: string;
      }
    | { type: 'divider'; id: string }
    | { type: 'section-header'; id: string; label: string };

interface VirtualizedExploreListProps {
    sortedGroupLabels: string[];
    exploreGroupMap: Record<string, SummaryExplore[]>;
    defaultUngroupedExplores: SummaryExplore[];
    customUngroupedExplores: SummaryExplore[];
    searchQuery: string;
    onExploreClick: (explore: SummaryExplore) => void;
}

const ITEM_HEIGHT = 40; // Base height for most items
const GROUP_HEADER_HEIGHT = 40;
const SECTION_HEADER_HEIGHT = 32;
const DIVIDER_HEIGHT = 16;

const VirtualizedExploreList: FC<VirtualizedExploreListProps> = ({
    sortedGroupLabels,
    exploreGroupMap,
    defaultUngroupedExplores,
    customUngroupedExplores,
    searchQuery,
    onExploreClick,
}) => {
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
        new Set(),
    );
    const parentRef = useRef<HTMLDivElement>(null);

    const toggleGroup = useCallback((groupLabel: string) => {
        setExpandedGroups((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(groupLabel)) {
                newSet.delete(groupLabel);
            } else {
                newSet.add(groupLabel);
            }
            return newSet;
        });
    }, []);

    // Create flattened list of items for virtualization
    const virtualItems = useMemo((): VirtualListItem[] => {
        const items: VirtualListItem[] = [];
        let itemId = 0;

        // Add grouped explores
        for (const groupLabel of sortedGroupLabels) {
            const explores = exploreGroupMap[groupLabel] || [];
            const isExpanded = expandedGroups.has(groupLabel);

            // Add group header
            items.push({
                type: 'group-header',
                id: `group-${itemId++}`,
                label: groupLabel,
                explores,
                isExpanded,
            });

            // Add explores if group is expanded
            if (isExpanded) {
                for (const explore of explores) {
                    items.push({
                        type: 'explore',
                        id: `explore-${itemId++}`,
                        explore,
                        groupLabel,
                    });
                }
            }
        }

        // Add ungrouped explores
        for (const explore of defaultUngroupedExplores) {
            items.push({
                type: 'explore',
                id: `ungrouped-${itemId++}`,
                explore,
            });
        }

        // Add virtual views section if there are custom explores
        if (customUngroupedExplores.length > 0) {
            items.push({
                type: 'divider',
                id: `divider-${itemId++}`,
            });
            items.push({
                type: 'section-header',
                id: `section-${itemId++}`,
                label: 'Virtual Views',
            });

            for (const explore of customUngroupedExplores) {
                items.push({
                    type: 'explore',
                    id: `virtual-${itemId++}`,
                    explore,
                });
            }
        }

        return items;
    }, [
        sortedGroupLabels,
        exploreGroupMap,
        defaultUngroupedExplores,
        customUngroupedExplores,
        expandedGroups,
    ]);

    const getItemHeight = useCallback(
        (index: number) => {
            const item = virtualItems[index];
            if (!item) return ITEM_HEIGHT;

            switch (item.type) {
                case 'group-header':
                    return GROUP_HEADER_HEIGHT;
                case 'section-header':
                    return SECTION_HEADER_HEIGHT;
                case 'divider':
                    return DIVIDER_HEIGHT;
                case 'explore':
                    return ITEM_HEIGHT;
                default:
                    return ITEM_HEIGHT;
            }
        },
        [virtualItems],
    );

    const virtualizer = useVirtualizer({
        count: virtualItems.length,
        getScrollElement: () => parentRef.current,
        estimateSize: getItemHeight,
        overscan: 5,
    });

    const renderItem = useCallback(
        (item: VirtualListItem) => {
            switch (item.type) {
                case 'group-header':
                    return (
                        <GroupHeader
                            key={item.id}
                            label={item.label}
                            isExpanded={item.isExpanded}
                            onToggle={() => toggleGroup(item.label)}
                        />
                    );

                case 'explore':
                    return (
                        <div
                            key={item.id}
                            style={{
                                paddingLeft: item.groupLabel ? '16px' : '0px',
                            }}
                        >
                            <ExploreNavLink
                                explore={item.explore}
                                query={searchQuery}
                                onClick={() => onExploreClick(item.explore)}
                            />
                        </div>
                    );

                case 'divider':
                    return (
                        <Divider
                            key={item.id}
                            size={0.5}
                            c="ldGray.5"
                            my="xs"
                        />
                    );

                case 'section-header':
                    return (
                        <Text
                            key={item.id}
                            fw={500}
                            fz="xs"
                            c="ldGray.6"
                            mb="xs"
                        >
                            {item.label}
                        </Text>
                    );

                default:
                    return null;
            }
        },
        [searchQuery, toggleGroup, onExploreClick],
    );

    return (
        <div
            ref={parentRef}
            style={{
                height: '100%',
                overflow: 'auto',
            }}
        >
            <div
                style={{
                    height: virtualizer.getTotalSize(),
                    position: 'relative',
                }}
            >
                {virtualizer.getVirtualItems().map((virtualItem) => {
                    const item = virtualItems[virtualItem.index];
                    if (!item) return null;

                    return (
                        <div
                            key={virtualItem.key}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: virtualItem.size,
                                transform: `translateY(${virtualItem.start}px)`,
                            }}
                        >
                            {renderItem(item)}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default memo(VirtualizedExploreList);
