import {
    getItemId,
    isAdditionalMetric,
    isCustomDimension,
    type CompiledTable,
} from '@lightdash/common';
import { isGroupNode, type Node } from '../Tree/types';
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
    node: Node,
    sectionKey: string,
    sectionType: TreeSection,
    tableName: string,
    expandedGroups: Set<string>,
    searchResults: string[],
    isSearching: boolean,
    depth: number = 0,
    parentId: string | null = null,
    ancestorPath: string[] = [],
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

        // Generate hierarchical ID
        const groupKey = buildGroupKey(tableName, sectionType, node.key);
        const id = parentId ? `${parentId}-child-${node.key}` : groupKey;
        const isExpanded = expandedGroups.has(groupKey) || isSearching;

        // Collect child IDs
        const childIds: string[] = [];

        // Add children if expanded and collect their IDs
        let childItems: TreeNodeItem[] = [];
        if (isExpanded) {
            Object.values(groupNode.children).forEach((child) => {
                const childItemsForThisChild = flattenNodeRecursive(
                    child,
                    sectionKey,
                    sectionType,
                    tableName,
                    expandedGroups,
                    searchResults,
                    isSearching,
                    depth + 1,
                    id,
                    [...ancestorPath, id],
                );
                // First item is always the child node itself
                if (childItemsForThisChild.length > 0) {
                    childIds.push(childItemsForThisChild[0].id);
                }
                childItems.push(...childItemsForThisChild);
            });
        }

        // Add the group node itself
        items.push({
            id,
            type: 'tree-node',
            estimatedHeight: ITEM_HEIGHTS.TREE_GROUP_NODE,
            data: {
                node,
                isGroup: true,
                isExpanded,
                sectionKey,
                depth,
                parentId,
                childIds,
                ancestorPath,
            },
        });

        // Add all collected children
        items.push(...childItems);
    } else {
        // Single node - generate hierarchical ID
        const id = parentId
            ? `${parentId}-child-${node.key}`
            : `${tableName}-${sectionType}-node-${node.key}`;

        items.push({
            id,
            type: 'tree-node',
            estimatedHeight: ITEM_HEIGHTS.TREE_SINGLE_NODE,
            data: {
                node,
                isGroup: false,
                sectionKey,
                depth,
                parentId,
                childIds: [],
                ancestorPath,
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
): TreeNodeItem[] {
    // Create section context and store it
    const sectionKey = buildSectionKey(tableName, sectionInfo.type);
    const sectionContext: SectionContext = {
        tableName,
        sectionType: sectionInfo.type,
        itemsMap: sectionInfo.itemsMap,
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

    const nodeMap = getNodeMapFromItemsMap(
        sectionInfo.itemsMap,
        // Get group details from table if available
        options.tables.find((t) => t.name === tableName)?.groupDetails,
    );

    const items: TreeNodeItem[] = [];

    Object.values(nodeMap).forEach((node) => {
        items.push(
            ...flattenNodeRecursive(
                node,
                sectionKey,
                sectionInfo.type,
                tableName,
                expandedGroups,
                searchResults,
                isSearching,
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
                treeSection: TreeSection.Dimensions, // Arbitrary, missing fields aren't tied to a section
                label: 'Missing fields',
                color: 'gray.6',
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
                    isDimension: true, // Will be determined by the component
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

    // Build global lookup map for O(1) access
    const itemsById = new Map<string, FlattenedItem>();
    items.forEach((item) => itemsById.set(item.id, item));

    return {
        items,
        sectionContexts,
        itemsById,
    };
}
