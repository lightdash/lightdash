import {
    friendlyName,
    type SummaryExplore,
    type WarehouseConnectionForUserCredentials,
} from '@lightdash/common';
import { Box, Divider, Text } from '@mantine/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { groupBy } from 'es-toolkit/compat';
import { memo, useCallback, useMemo, useRef, useState, type FC } from 'react';
import { useModelsInDevelopment } from '../../../features/semanticStudio/useModelsInDevelopment';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { getConnectionName } from '../../common/connectionName';
import ExploreNavLink from './ExploreNavLink';
import {
    collectMatchingGroupPathsFromArray,
    type ExploreNode,
} from './exploreTree';
import GroupHeader from './GroupHeader';
import SectionHeader from './SectionHeader';
import classes from './VirtualizedExploreList.module.css';

const INDENT_PER_DEPTH = 16;

export type VirtualListItem =
    | {
          type: 'group-header';
          id: string;
          label: string;
          description?: string;
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
          count: number;
          isExpanded: boolean;
      }
    | { type: 'source-label'; id: string; label: string };

interface VirtualizedExploreListProps {
    groupedExploreTree: ExploreNode[];
    defaultUngroupedExplores: SummaryExplore[];
    customUngroupedExplores: SummaryExplore[];
    preAggregateExplores: SummaryExplore[];
    externalSourceExplores: SummaryExplore[];
    searchQuery: string;
    connections: WarehouseConnectionForUserCredentials[] | null;
    onExploreClick: (explore: SummaryExplore) => void;
}

const ITEM_HEIGHT = 40;
const GROUP_HEADER_HEIGHT = 40;
const SECTION_HEADER_HEIGHT = 32;
const DIVIDER_HEIGHT = 16;
const SOURCE_LABEL_HEIGHT = 26;

const getPreAggregateSourceName = (explore: SummaryExplore) =>
    ('preAggregateSource' in explore
        ? explore.preAggregateSource?.sourceExploreName
        : undefined) ?? '';

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
    externalSourceExplores,
    searchQuery,
    connections,
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
    const inDevelopment = useModelsInDevelopment(useProjectUuid());

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
                        description: node.description,
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

        if (externalSourceExplores.length > 0) {
            // Auto-expand while searching so matches inside the section are
            // visible without a manual toggle.
            const isExternalSourcesExpanded =
                expandedSections.has('External sources') || !!searchQuery;
            items.push({ type: 'divider', id: `divider-${itemId++}` });
            items.push({
                type: 'section-header',
                id: `section-${itemId++}`,
                label: 'External sources',
                count: externalSourceExplores.length,
                isExpanded: isExternalSourcesExpanded,
            });
            if (isExternalSourcesExpanded) {
                for (const explore of externalSourceExplores) {
                    items.push({
                        type: 'explore',
                        id: `external-source-${itemId++}`,
                        explore,
                        depth: 0,
                    });
                }
            }
        }

        if (customUngroupedExplores.length > 0) {
            const isVirtualViewsExpanded =
                expandedSections.has('Virtual Views') || !!searchQuery;
            items.push({ type: 'divider', id: `divider-${itemId++}` });
            items.push({
                type: 'section-header',
                id: `section-${itemId++}`,
                label: 'Virtual Views',
                count: customUngroupedExplores.length,
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
                expandedSections.has('Pre-aggregates') || !!searchQuery;
            items.push({ type: 'divider', id: `divider-${itemId++}` });
            items.push({
                type: 'section-header',
                id: `section-${itemId++}`,
                label: 'Pre-aggregates',
                count: preAggregateExplores.length,
                isExpanded: isPreAggregatesExpanded,
            });
            if (isPreAggregatesExpanded) {
                // Pre-aggregates sit under the table they were built from
                const bySource = groupBy(
                    preAggregateExplores,
                    getPreAggregateSourceName,
                );
                for (const sourceName of Object.keys(bySource).sort()) {
                    if (sourceName) {
                        items.push({
                            type: 'source-label',
                            id: `source-${itemId++}`,
                            label: friendlyName(sourceName),
                        });
                    }
                    for (const explore of bySource[sourceName]) {
                        items.push({
                            type: 'explore',
                            id: `pre-aggregate-${itemId++}`,
                            explore,
                            depth: 0,
                        });
                    }
                }
            }
        }

        return items;
    }, [
        groupedExploreTree,
        defaultUngroupedExplores,
        customUngroupedExplores,
        preAggregateExplores,
        externalSourceExplores,
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
                case 'source-label':
                    return SOURCE_LABEL_HEIGHT;
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
                            description={item.description}
                            isExpanded={item.isExpanded}
                            depth={item.depth}
                            onToggle={() => toggleGroup(item.path)}
                        />
                    );
                case 'explore':
                    return (
                        <Box key={item.id} pl={item.depth * INDENT_PER_DEPTH}>
                            <ExploreNavLink
                                explore={item.explore}
                                connectionName={getConnectionName(
                                    connections,
                                    item.explore.warehouseConnectionUuid,
                                )}
                                query={searchQuery}
                                isInDevelopment={inDevelopment.has(
                                    item.explore.name,
                                )}
                                onClick={() => onExploreClick(item.explore)}
                            />
                        </Box>
                    );
                case 'divider':
                    return <Divider key={item.id} my="xs" />;
                case 'section-header':
                    return (
                        <SectionHeader
                            key={item.id}
                            label={item.label}
                            count={item.count}
                            isExpanded={item.isExpanded}
                            onToggle={() => toggleSection(item.label)}
                        />
                    );
                case 'source-label':
                    return (
                        <Text
                            key={item.id}
                            fz={11}
                            fw={500}
                            c="dimmed"
                            px="sm"
                            pt={8}
                            truncate
                        >
                            {item.label}
                        </Text>
                    );
                default:
                    return null;
            }
        },
        [
            searchQuery,
            connections,
            inDevelopment,
            toggleGroup,
            toggleSection,
            onExploreClick,
        ],
    );

    return (
        <Box ref={parentRef} className={classes.scroller}>
            <Box
                className={classes.sizer}
                style={{
                    '--list-height': `${virtualizer.getTotalSize() + 16}px`,
                }}
            >
                {virtualizer.getVirtualItems().map((virtualItem) => {
                    const item = virtualItems[virtualItem.index];
                    if (!item) return null;
                    return (
                        <Box
                            key={virtualItem.key}
                            className={classes.item}
                            style={{
                                '--item-height': `${virtualItem.size}px`,
                                '--item-start': `${virtualItem.start}px`,
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
