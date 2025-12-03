import {
    getItemId,
    isAdditionalMetric,
    isCustomDimension,
    OrderFieldsByStrategy,
    type AdditionalMetric,
    type CompiledTable,
    type CustomDimension,
    type Explore,
} from '@lightdash/common';
import { sortNodes } from '../Tree/sortNodes';
import {
    isGroupNode,
    type NodeMap,
    type Node as TreeNode,
} from '../Tree/types';
import { getNodeMapFromItemsMap } from '../Tree/utils';
import {
    buildGroupKey,
    buildSectionKey,
    ITEM_HEIGHTS,
    TreeSection,
    type EmptyStateItem,
    type FlattenedItem,
    type FlattenedTreeData,
    type FlattenTreeOptions,
    type MissingFieldItem,
    type SectionContext,
    type SectionHeaderItem,
    type SectionInfo,
    type TableHeaderItem,
    type TreeNodeItem,
} from './types';

/**
 * Recursively flatten a node and its children
 */
function flattenNodeRecursive(
    node: TreeNode,
    sectionKey: string,
    sectionType: TreeSection,
    tableName: string,
    expandedGroups: Set<string>,
    searchResults: string[],
    isSearching: boolean,
    depth: number = 0,
    parentPath: string = '',
): TreeNodeItem[] {
    const items: TreeNodeItem[] = [];

    // Check if this node or its children match search
    const isVisible = !isSearching || searchResults.includes(node.key);

    const isGroup = isGroupNode(node);

    if (!isVisible && !isGroup) return items;

    // If it's a group, check if any children are visible
    if (isGroup) {
        const groupNode = node;
        const hasVisibleChildren = Object.values(groupNode.children).some(
            (child) =>
                !isSearching ||
                searchResults.includes(child.key) ||
                ('children' in child &&
                    child.children &&
                    Object.values(child.children).some((grandchild) =>
                        searchResults.includes(grandchild.key),
                    )),
        );

        if (!hasVisibleChildren && isSearching) {
            return items;
        }

        // Add the group node itself
        const groupKey = buildGroupKey(
            tableName,
            sectionType,
            node.key,
            parentPath,
        );
        const isExpanded = expandedGroups.has(groupKey) || isSearching;

        items.push({
            id: groupKey,
            type: 'tree-node',
            estimatedHeight: ITEM_HEIGHTS.TREE_GROUP_NODE,
            data: {
                node,
                isGroup: true,
                isExpanded,
                sectionKey,
                depth,
            },
        });

        // Add children if expanded
        if (isExpanded) {
            // Build the parent path for children: append current node's key
            const childParentPath = parentPath
                ? `${parentPath}-${node.key}`
                : node.key;

            Object.values(groupNode.children).forEach((child) => {
                items.push(
                    ...flattenNodeRecursive(
                        child,
                        sectionKey,
                        sectionType,
                        tableName,
                        expandedGroups,
                        searchResults,
                        isSearching,
                        depth + 1,
                        childParentPath,
                    ),
                );
            });
        }
    } else {
        // Single node
        items.push({
            id: `${tableName}-${sectionType}-node-${node.key}`,
            type: 'tree-node',
            estimatedHeight: ITEM_HEIGHTS.TREE_SINGLE_NODE,
            data: {
                node,
                isGroup: false,
                sectionKey,
                depth,
            },
        });
    }

    return items;
}

/**
 * Flatten a section's nodes
 */
function flattenSection(
    sectionInfo: SectionInfo,
    tableName: string,
    expandedGroups: Set<string>,
    searchResults: string[],
    isSearching: boolean,
    options: FlattenTreeOptions,
    sectionContexts: Map<string, SectionContext>,
    baseDepth: number = 0,
): TreeNodeItem[] {
    // Use pre-computed nodeMap from options instead of computing it here
    const nodeMapKey = `${tableName}-${sectionInfo.type}`;
    const nodeMap = options.sectionNodeMaps.get(nodeMapKey);

    // If no nodeMap found (shouldn't happen), return empty array
    if (!nodeMap) {
        return [];
    }

    // Create section context and store it
    const sectionKey = buildSectionKey(tableName, sectionInfo.type);
    const sectionContext: SectionContext = {
        tableName,
        sectionType: sectionInfo.type,
        itemsMap: sectionInfo.itemsMap,
        nodeMap, // Store the pre-computed nodeMap
        missingCustomMetrics:
            sectionInfo.type === TreeSection.CustomMetrics &&
            sectionInfo.missingItems
                ? sectionInfo.missingItems.filter((i) => isAdditionalMetric(i))
                : undefined,
        missingCustomDimensions:
            sectionInfo.type === TreeSection.CustomDimensions &&
            sectionInfo.missingItems
                ? sectionInfo.missingItems.filter((i) => isCustomDimension(i))
                : undefined,
        itemsAlerts: sectionInfo.itemsAlerts,
        orderFieldsBy: sectionInfo.orderFieldsBy,
        isGithubIntegrationEnabled: options.isGithubIntegrationEnabled,
        gitIntegration: options.gitIntegration,
        searchQuery: options.searchQuery,
        searchResults,
    };
    sectionContexts.set(sectionKey, sectionContext);

    const items: TreeNodeItem[] = [];

    // Sort nodes using the same logic as non-virtualized tree
    const orderStrategy =
        sectionInfo.orderFieldsBy ?? OrderFieldsByStrategy.LABEL;
    const sortedNodes = Object.values(nodeMap).sort(
        sortNodes(orderStrategy, sectionInfo.itemsMap),
    );

    sortedNodes.forEach((node) => {
        items.push(
            ...flattenNodeRecursive(
                node,
                sectionKey,
                sectionInfo.type,
                tableName,
                expandedGroups,
                searchResults,
                isSearching,
                baseDepth,
            ),
        );
    });

    return items;
}

/**
 * Flatten a single table into items
 */
function flattenTable(
    table: CompiledTable,
    options: FlattenTreeOptions,
    sectionContexts: Map<string, SectionContext>,
): FlattenedItem[] {
    const items: FlattenedItem[] = [];
    const tableName = table.name;
    const isExpanded =
        options.expandedTables.has(tableName) || options.isSearching;
    const searchResults = options.searchResultsMap[tableName] || [];

    // When showing multiple tables with headers, all content should be indented one level
    const baseDepth = options.showMultipleTables ? 1 : 0;

    // Add table header if showing multiple tables
    if (options.showMultipleTables) {
        items.push({
            id: `table-header-${tableName}`,
            type: 'table-header',
            estimatedHeight: ITEM_HEIGHTS.TABLE_HEADER,
            data: {
                table,
                isExpanded,
            },
        } satisfies TableHeaderItem);
    }

    // Skip table content if not expanded and not searching
    if (!isExpanded) {
        return items;
    }

    // Add missing fields if any
    const missingFieldsForTable = options.missingFieldIds;
    if (missingFieldsForTable.length > 0) {
        items.push({
            id: `${tableName}-section-missing`,
            type: 'section-header',
            estimatedHeight: ITEM_HEIGHTS.SECTION_HEADER,
            data: {
                tableName,
                treeSection: TreeSection.MissingFields, // Arbitrary, missing fields aren't tied to a section
                label: 'Missing fields',
                color: 'ldGray.6',
                depth: baseDepth,
            },
        } satisfies SectionHeaderItem);

        missingFieldsForTable.forEach((fieldId) => {
            items.push({
                id: `${tableName}-missing-${fieldId}`,
                type: 'missing-field',
                estimatedHeight: ITEM_HEIGHTS.MISSING_FIELD,
                data: {
                    fieldId,
                    tableName,
                    isDimension: options.selectedDimensions.includes(fieldId),
                },
            } satisfies MissingFieldItem);
        });
    }

    // Helper to check if section has any visible items
    const sectionHasResults = (sectionResults: TreeNodeItem[]) => {
        return sectionResults.length > 0;
    };

    // 1. Dimensions section
    const dimensionsMap = Object.values(table.dimensions).reduce(
        (acc, item) => ({ ...acc, [getItemId(item)]: item }),
        {},
    );
    const hasDimensions = Object.keys(dimensionsMap).length > 0;

    if (
        hasDimensions ||
        (!options.isSearching && !hasDimensions) ||
        (options.isSearching && searchResults.length > 0)
    ) {
        items.push({
            id: `${tableName}-section-dimensions`,
            type: 'section-header',
            estimatedHeight: ITEM_HEIGHTS.SECTION_HEADER,
            data: {
                tableName,
                treeSection: TreeSection.Dimensions,
                label: 'Dimensions',
                color: 'blue.9',
                depth: baseDepth,
            },
        } satisfies SectionHeaderItem);
    }

    if (hasDimensions) {
        const dimensionItems = flattenSection(
            {
                type: TreeSection.Dimensions,
                label: 'Dimensions',
                color: 'blue.9',
                itemsMap: dimensionsMap,
                orderFieldsBy: table.orderFieldsBy,
            },
            tableName,
            options.expandedGroups,
            searchResults,
            options.isSearching,
            options,
            sectionContexts,
            baseDepth,
        );

        if (sectionHasResults(dimensionItems) || !options.isSearching) {
            items.push(...dimensionItems);
        }
    } else if (!options.isSearching) {
        items.push({
            id: `${tableName}-empty-dimensions`,
            type: 'empty-state',
            estimatedHeight: ITEM_HEIGHTS.EMPTY_STATE,
            data: {
                tableName,
                treeSection: TreeSection.Dimensions,
                message: 'No dimensions defined in your dbt project',
            },
        } satisfies EmptyStateItem);
    }

    // 2. Metrics section
    const metricsMap = Object.values(table.metrics).reduce(
        (acc, item) => ({ ...acc, [getItemId(item)]: item }),
        {},
    );
    const hasMetrics = Object.keys(metricsMap).length > 0;

    if (
        hasMetrics ||
        (!options.isSearching && !hasMetrics) ||
        (options.isSearching && searchResults.length > 0)
    ) {
        items.push({
            id: `${tableName}-section-metrics`,
            type: 'section-header',
            estimatedHeight: ITEM_HEIGHTS.SECTION_HEADER,
            data: {
                tableName,
                treeSection: TreeSection.Metrics,
                label: 'Metrics',
                color: 'yellow.9',
                depth: baseDepth,
                helpButton: !hasMetrics
                    ? {
                          href: 'https://docs.lightdash.com/guides/how-to-create-metrics',
                          tooltipText:
                              'No metrics defined in your dbt project. Click to view docs and learn how to add a metric to your project.',
                      }
                    : undefined,
            },
        } satisfies SectionHeaderItem);
    }

    if (hasMetrics) {
        const metricItems = flattenSection(
            {
                type: TreeSection.Metrics,
                label: 'Metrics',
                color: 'yellow.9',
                itemsMap: metricsMap,
                orderFieldsBy: table.orderFieldsBy,
            },
            tableName,
            options.expandedGroups,
            searchResults,
            options.isSearching,
            options,
            sectionContexts,
            baseDepth,
        );

        if (sectionHasResults(metricItems) || !options.isSearching) {
            items.push(...metricItems);
        }
    }

    // 3. Custom metrics section
    const customMetricsForTable = options.additionalMetrics.filter(
        (metric) => metric.table === tableName,
    );
    const customMetricsMap = [
        ...customMetricsForTable,
        ...options.missingCustomMetrics.filter((m) => m.table === tableName),
    ].reduce((acc, item) => ({ ...acc, [getItemId(item)]: item }), {});

    if (Object.keys(customMetricsMap).length > 0) {
        items.push({
            id: `${tableName}-section-custom-metrics`,
            type: 'section-header',
            estimatedHeight: ITEM_HEIGHTS.SECTION_HEADER,
            data: {
                tableName,
                treeSection: TreeSection.CustomMetrics,
                label: 'Custom metrics',
                color: 'yellow.9',
                depth: baseDepth,
                helpButton: {
                    href: 'https://docs.lightdash.com/guides/how-to-create-metrics#-adding-custom-metrics-in-the-explore-view',
                    tooltipText:
                        'Add custom metrics by hovering over the dimension of your choice & selecting the three-dot Action Menu. Click to view docs.',
                },
            },
        } satisfies SectionHeaderItem);

        // Calculate custom metrics issues
        const customMetricsIssues = options.additionalMetrics.reduce(
            (acc, item) => {
                const foundDuplicateId = Object.keys(metricsMap).includes(
                    getItemId(item),
                );
                return {
                    ...acc,
                    [getItemId(item)]: {
                        errors: foundDuplicateId
                            ? [
                                  {
                                      message:
                                          'A metric with this ID already exists in the table. Rename your custom metric to prevent conflicts.',
                                  },
                              ]
                            : undefined,
                    },
                };
            },
            {},
        );

        const customMetricItems = flattenSection(
            {
                type: TreeSection.CustomMetrics,
                label: 'Custom metrics',
                color: 'yellow.9',
                itemsMap: customMetricsMap,
                missingItems: options.missingCustomMetrics.filter(
                    (m) => m.table === tableName,
                ),
                itemsAlerts: customMetricsIssues,
                orderFieldsBy: table.orderFieldsBy,
            },
            tableName,
            options.expandedGroups,
            searchResults,
            options.isSearching,
            options,
            sectionContexts,
            baseDepth,
        );

        items.push(...customMetricItems);
    }

    // 4. Custom dimensions section
    const customDimensionsForTable =
        options.customDimensions?.filter((dim) => dim.table === tableName) ||
        [];
    const customDimensionsMap = customDimensionsForTable.reduce(
        (acc, item) => ({ ...acc, [getItemId(item)]: item }),
        {},
    );

    if (Object.keys(customDimensionsMap).length > 0) {
        items.push({
            id: `${tableName}-section-custom-dimensions`,
            type: 'section-header',
            estimatedHeight: ITEM_HEIGHTS.SECTION_HEADER,
            data: {
                tableName,
                treeSection: TreeSection.CustomDimensions,
                label: 'Custom dimensions',
                color: 'blue.9',
                depth: baseDepth,
            },
        } satisfies SectionHeaderItem);

        const customDimensionItems = flattenSection(
            {
                type: TreeSection.CustomDimensions,
                label: 'Custom dimensions',
                color: 'blue.9',
                itemsMap: customDimensionsMap,
                missingItems: options.missingCustomDimensions.filter(
                    (d) => d.table === tableName,
                ),
                orderFieldsBy: table.orderFieldsBy,
            },
            tableName,
            options.expandedGroups,
            searchResults,
            options.isSearching,
            options,
            sectionContexts,
            baseDepth,
        );

        items.push(...customDimensionItems);
    }

    return items;
}

/**
 * Main function to flatten the entire tree structure for virtualization
 * Returns both the flattened items and a map of section contexts (shared data)
 */
export function flattenTreeForVirtualization(
    options: FlattenTreeOptions,
): FlattenedTreeData {
    const items: FlattenedItem[] = [];
    const sectionContexts = new Map<string, SectionContext>();

    // Filter tables that have search results (or all if not searching)
    const visibleTables = options.tables.filter((table) => {
        if (!options.isSearching) return true;
        const results = options.searchResultsMap[table.name] || [];
        return results.length > 0;
    });

    visibleTables.forEach((table) => {
        items.push(...flattenTable(table, options, sectionContexts));
    });

    return {
        items,
        sectionContexts,
    };
}

export function getNodeMapsForVirtualization(
    explore: Explore,
    additionalMetrics: AdditionalMetric[],
    customDimensions: CustomDimension[],
) {
    const maps = new Map<string, NodeMap>();

    Object.values(explore.tables).forEach((table) => {
        const tableName = table.name;

        // Dimensions section
        const dimensionsMap = Object.fromEntries(
            Object.values(table.dimensions).map((d) => [getItemId(d), d]),
        );
        if (Object.keys(dimensionsMap).length > 0) {
            maps.set(
                `${tableName}-dimensions`,
                getNodeMapFromItemsMap(
                    dimensionsMap,
                    table.groupDetails,
                    table.orderFieldsBy,
                ),
            );
        }

        // Metrics section
        const metricsMap = Object.fromEntries(
            Object.values(table.metrics).map((m) => [getItemId(m), m]),
        );
        if (Object.keys(metricsMap).length > 0) {
            maps.set(
                `${tableName}-metrics`,
                getNodeMapFromItemsMap(
                    metricsMap,
                    table.groupDetails,
                    table.orderFieldsBy,
                ),
            );
        }

        // Custom metrics section
        const customMetricsForTable = additionalMetrics.filter(
            (metric) => metric.table === tableName,
        );
        if (customMetricsForTable.length > 0) {
            const customMetricsMap = Object.fromEntries(
                customMetricsForTable.map((m) => [getItemId(m), m]),
            );
            maps.set(
                `${tableName}-custom-metrics`,
                getNodeMapFromItemsMap(
                    customMetricsMap,
                    table.groupDetails,
                    table.orderFieldsBy,
                ),
            );
        }

        // Custom dimensions section
        const customDimensionsForTable =
            customDimensions?.filter((dim) => dim.table === tableName) || [];
        if (customDimensionsForTable.length > 0) {
            const customDimensionsMap = Object.fromEntries(
                customDimensionsForTable.map((d) => [getItemId(d), d]),
            );
            maps.set(
                `${tableName}-custom-dimensions`,
                getNodeMapFromItemsMap(
                    customDimensionsMap,
                    table.groupDetails,
                    table.orderFieldsBy,
                ),
            );
        }
    });

    return maps;
}
