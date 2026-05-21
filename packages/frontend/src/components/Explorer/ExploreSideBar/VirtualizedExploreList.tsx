import { type SummaryExplore } from '@lightdash/common';
import { Box, Divider } from '@mantine-8/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useCallback, useMemo, useRef, useState, type FC } from 'react';
import ExploreNavLink from './ExploreNavLink';
import {
    collectMatchingGroupPathsFromArray,
    type ExploreNode,
} from './exploreTree';
import GroupHeader from './GroupHeader';
import SectionHeader from './SectionHeader';

const INDENT_PER_DEPTH = 16;

export type VirtualListItem =
    | {
          type: 'group-header';
          id: string;
          label: string;
          path: string;
          depth: number;
          isExpanded: boolean;
      }
    | {
          type: 'explore';
          id: string;
          explore: SummaryExplore;
          depth: number;
      }
    | { type: 'divider'; id: string }
    | {
          type: 'section-header';
          id: string;
          label: string;
          isExpanded: boolean;
      };

interface VirtualizedExploreListProps {
    groupedExploreTree: ExploreNode[];
    defaultUngroupedExplores: SummaryExplore[];
    customUngroupedExplores: SummaryExplore[];
    preAggregateExplores: SummaryExplore[];
    searchQuery: string;
    onExploreClick: (explore: SummaryExplore) => void;
}

const ITEM_HEIGHT = 40;
const GROUP_HEADER_HEIGHT = 40;
const SECTION_HEADER_HEIGHT = 32;
const DIVIDER_HEIGHT = 16;

const collectExploreNamesInTree = (
    nodes: ExploreNode[],
    out: Set<string>,
): Set<string> => {
    for (const node of nodes) {
        if (node.type === 'explore') {
            out.add(node.key);
        } else {
            collectExploreNamesInTree(Object.values(node.children), out);
        }
    }
    return out;
};

const VirtualizedExploreList: FC<VirtualizedExploreListProps> = ({
    groupedExploreTree,
    defaultUngroupedExplores,
    customUngroupedExplores,
    preAggregateExplores,
    searchQuery,
    onExploreClick,
}) => {
    const [expandedGroupPaths, setExpandedGroupPaths] = useState<Set<string>>(
        new Set(),
    );
    // Sections are collapsed by default (empty set means all collapsed)
    const [expandedSections, setExpandedSections] = useState<Set<string>>(
        new Set(),
    );
    const parentRef = useRef<HTMLDivElement>(null);

    const toggleGroup = useCallback((path: string) => {
        setExpandedGroupPaths((prev) => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    }, []);

    const toggleSection = useCallback((sectionLabel: string) => {
        setExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(sectionLabel)) {
                next.delete(sectionLabel);
            } else {
                next.add(sectionLabel);
            }
            return next;
        });
    }, []);

    const virtualItems = useMemo<VirtualListItem[]>(() => {
        // Auto-expand any group whose subtree contains a search match.
        // Derived inline (rather than via setState in an effect) so the
        // expansion is purely visual and resets when search clears.
        const searchExpansion = searchQuery
            ? collectMatchingGroupPathsFromArray(
                  groupedExploreTree,
                  collectExploreNamesInTree(groupedExploreTree, new Set()),
              )
            : null;

        const isPathExpanded = (path: string): boolean =>
            expandedGroupPaths.has(path) ||
            (searchExpansion?.has(path) ?? false);

        const items: VirtualListItem[] = [];
        let itemId = 0;

        const visit = (nodes: ExploreNode[], depth: number): void => {
            for (const node of nodes) {
                if (node.type === 'group') {
                    const isExpanded = isPathExpanded(node.path);
                    items.push({
                        type: 'group-header',
                        id: `group-${itemId++}`,
                        label: node.label,
                        path: node.path,
                        depth,
                        isExpanded,
                    });
                    if (isExpanded) {
                        visit(Object.values(node.children), depth + 1);
                    }
                } else {
                    items.push({
                        type: 'explore',
                        id: `explore-${itemId++}`,
                        explore: node.explore,
                        depth,
                    });
                }
            }
        };

        visit(groupedExploreTree, 0);

        for (const explore of defaultUngroupedExplores) {
            items.push({
                type: 'explore',
                id: `ungrouped-${itemId++}`,
                explore,
                depth: 0,
            });
        }

        if (customUngroupedExplores.length > 0) {
            const isVirtualViewsExpanded =
                expandedSections.has('Virtual Views');
            items.push({ type: 'divider', id: `divider-${itemId++}` });
            items.push({
                type: 'section-header',
                id: `section-${itemId++}`,
                label: 'Virtual Views',
                isExpanded: isVirtualViewsExpanded,
            });
            if (isVirtualViewsExpanded) {
                for (const explore of customUngroupedExplores) {
                    items.push({
                        type: 'explore',
                        id: `virtual-${itemId++}`,
                        explore,
                        depth: 0,
                    });
                }
            }
        }

        if (preAggregateExplores.length > 0) {
            const isPreAggregatesExpanded =
                expandedSections.has('Pre-aggregates');
            items.push({ type: 'divider', id: `divider-${itemId++}` });
            items.push({
                type: 'section-header',
                id: `section-${itemId++}`,
                label: 'Pre-aggregates',
                isExpanded: isPreAggregatesExpanded,
            });
            if (isPreAggregatesExpanded) {
                for (const explore of preAggregateExplores) {
                    items.push({
                        type: 'explore',
                        id: `pre-aggregate-${itemId++}`,
                        explore,
                        depth: 0,
                    });
                }
            }
        }

        return items;
    }, [
        groupedExploreTree,
        defaultUngroupedExplores,
        customUngroupedExplores,
        preAggregateExplores,
        expandedGroupPaths,
        expandedSections,
        searchQuery,
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
                            depth={item.depth}
                            onToggle={() => toggleGroup(item.path)}
                        />
                    );
                case 'explore':
                    return (
                        <Box
                            key={item.id}
                            style={{
                                paddingLeft: `${item.depth * INDENT_PER_DEPTH}px`,
                            }}
                        >
                            <ExploreNavLink
                                explore={item.explore}
                                query={searchQuery}
                                onClick={() => onExploreClick(item.explore)}
                            />
                        </Box>
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
                        <SectionHeader
                            key={item.id}
                            label={item.label}
                            isExpanded={item.isExpanded}
                            onToggle={() => toggleSection(item.label)}
                        />
                    );
                default:
                    return null;
            }
        },
        [searchQuery, toggleGroup, toggleSection, onExploreClick],
    );

    return (
        <Box
            ref={parentRef}
            style={{
                height: '100%',
                overflow: 'auto',
            }}
        >
            <Box
                style={{
                    height: virtualizer.getTotalSize() + 16,
                    position: 'relative',
                }}
            >
                {virtualizer.getVirtualItems().map((virtualItem) => {
                    const item = virtualItems[virtualItem.index];
                    if (!item) return null;
                    return (
                        <Box
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
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
};

export default memo(VirtualizedExploreList);
