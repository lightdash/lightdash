/**
 * Filter Tree Utilities - Normalized filter state management
 *
 * Provides utilities for converting between nested FilterGroup tree structure
 * and flat normalized tree structure for efficient filter manipulation.
 *
 * See CLAUDE.md for architecture overview and usage examples.
 */

import {
    FilterGroupOperator,
    getItemsFromFilterGroup,
    isAndFilterGroup,
    isFilterGroup,
    type FilterGroup,
    type FilterRule,
    type Filters,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';

export type FilterTreeGroupKey = 'dimensions' | 'metrics' | 'tableCalculations';

/**
 * Normalized flat tree structure for efficient filter manipulation with immer
 * Enables O(1) access to any node by ID for atomic updates
 * Preserves original wrapper group IDs for stable comparisons
 */
export type FilterTreeState = {
    byId: Record<string, FilterTreeNode>;
    rootId: string;
    // Original wrapper group IDs from API (preserved during flatten/unflatten)
    originalWrapperIds?: {
        dimensions?: string;
        metrics?: string;
        tableCalculations?: string;
    };
};

/**
 * A node in the filter tree - either a group (AND/OR) or a leaf rule
 * Rule nodes store their groupKey to avoid re-computation
 */
export type FilterTreeNode =
    | {
          type: 'group';
          id: string;
          operator: FilterGroupOperator;
          childIds: string[];
          parentId: string | null;
      }
    | {
          type: 'rule';
          id: string;
          groupKey: FilterTreeGroupKey;
          rule: FilterRule;
          parentId: string | null;
      };

/**
 * Convert a nested FilterGroup to a flat normalized tree structure
 * @param filterGroup - The nested filter group to normalize
 * @param groupKey - The groupKey for all rules in this group
 * @returns Flat tree structure with byId lookup
 */
const normalizeFilterGroup = (
    filterGroup: FilterGroup,
    groupKey: FilterTreeGroupKey,
    byId: Record<string, FilterTreeNode>,
    parentId: string | null,
): string => {
    const groupId = filterGroup.id;
    const operator = isAndFilterGroup(filterGroup)
        ? FilterGroupOperator.and
        : FilterGroupOperator.or;
    const items = getItemsFromFilterGroup(filterGroup);

    // First create the group node with empty children
    byId[groupId] = {
        type: 'group',
        id: groupId,
        operator,
        childIds: [],
        parentId,
    };

    // Then traverse children and populate childIds
    const childIds = items.map((child) => {
        if (isFilterGroup(child)) {
            return normalizeFilterGroup(child, groupKey, byId, groupId);
        }

        // It's a filter rule - store groupKey in the node
        const ruleId = child.id;

        byId[ruleId] = {
            type: 'rule',
            id: ruleId,
            groupKey,
            rule: child,
            parentId: groupId,
        };

        return ruleId;
    });

    byId[groupId].childIds = childIds;

    return groupId;
};

/**
 * Normalize an entire Filters object into a single tree with synthetic root
 * Implements deduplication: AND groups are flattened into root (root is always AND)
 * @param filters - The filters object to normalize
 * @returns Single normalized tree with synthetic root, AND groups flattened
 */
export const normalizeFilters = (filters: Filters): FilterTreeState => {
    const byId: Record<string, FilterTreeNode> = {};
    const rootId = uuidv4();
    const originalWrapperIds: FilterTreeState['originalWrapperIds'] = {};

    // Create synthetic root node (always AND)
    byId[rootId] = {
        type: 'group',
        id: rootId,
        operator: FilterGroupOperator.and,
        childIds: [],
        parentId: null,
    };

    const rootNode = byId[rootId] as Extract<FilterTreeNode, { type: 'group' }>;

    // Helper to process each filter type with deduplication
    const processFilterType = (
        filterGroup: FilterGroup,
        groupKey: FilterTreeGroupKey,
    ): void => {
        const isAndGroup = isAndFilterGroup(filterGroup);

        // If AND group, flatten children into root but preserve original ID
        if (isAndGroup) {
            // Store the original wrapper group ID for later reconstruction
            originalWrapperIds[groupKey] = filterGroup.id;

            const items = getItemsFromFilterGroup(filterGroup);
            items.forEach((item) => {
                if (isFilterGroup(item)) {
                    // Nested group - normalize and add to root
                    const childId = normalizeFilterGroup(
                        item,
                        groupKey,
                        byId,
                        rootId,
                    );
                    rootNode.childIds.push(childId);
                } else {
                    // Rule - add directly to root
                    const ruleId = item.id;
                    byId[ruleId] = {
                        type: 'rule',
                        id: ruleId,
                        groupKey,
                        rule: item,
                        parentId: rootId,
                    };
                    rootNode.childIds.push(ruleId);
                }
            });
        } else {
            // OR group - keep as child group (different operator from root)
            const childId = normalizeFilterGroup(
                filterGroup,
                groupKey,
                byId,
                rootId,
            );
            rootNode.childIds.push(childId);
        }
    };

    // Process each filter type
    if (filters.dimensions) {
        processFilterType(filters.dimensions, 'dimensions');
    }

    if (filters.metrics) {
        processFilterType(filters.metrics, 'metrics');
    }

    if (filters.tableCalculations) {
        processFilterType(filters.tableCalculations, 'tableCalculations');
    }

    return { byId, rootId, originalWrapperIds };
};

/**
 * Helper to recursively build a group from a node
 * @param tree - The filter tree
 * @param nodeId - ID of the node to build a group from
 * @returns The built group
 */
const buildGroup = (tree: FilterTreeState, nodeId: string): FilterGroup => {
    const node = tree.byId[nodeId];
    if (!node || node.type !== 'group') {
        throw new Error(`Invalid group node ${nodeId}`);
    }

    const children = node.childIds.map((childId) => {
        const child = tree.byId[childId];
        if (!child) throw new Error(`Node ${childId} not found`);
        if (child.type === 'rule') return child.rule;
        return buildGroup(tree, childId);
    });

    // Type assertion to ensure the correct type is returned
    return node.operator === FilterGroupOperator.and
        ? {
              id: node.id,
              and: children,
          }
        : {
              id: node.id,
              or: children,
          };
};

/**
 * Build FilterGroups for each category
 * @param tree - The filter tree
 * @param childIds - IDs of the child nodes to build a filter group from
 * @param groupKey - The groupKey for the filter group to build
 * @returns The built filter group
 */
const buildFilterGroup = (
    tree: FilterTreeState,
    childIds: string[],
    groupKey: FilterTreeGroupKey,
): FilterGroup | undefined => {
    if (childIds.length === 0) return undefined;

    const children = childIds.map((childId) => {
        const node = tree.byId[childId];
        if (!node) throw new Error(`Node ${childId} not found`);

        if (node.type === 'rule') {
            return node.rule;
        }

        // It's a group - recursively build
        const groupChildren = node.childIds.map((id) => {
            const child = tree.byId[id];
            if (!child) throw new Error(`Node ${id} not found`);
            if (child.type === 'rule') return child.rule;
            return buildGroup(tree, id);
        });

        return node.operator === FilterGroupOperator.and
            ? {
                  id: node.id,
                  and: groupChildren,
              }
            : {
                  id: node.id,
                  or: groupChildren,
              };
    });

    // If there's only one child and it's a group, return it directly
    if (children.length === 1 && isFilterGroup(children[0])) {
        return children[0];
    }

    // Otherwise wrap in an AND group
    // Use original wrapper ID if available, otherwise generate new one
    const wrapperId = tree.originalWrapperIds?.[groupKey] ?? uuidv4();

    return {
        id: wrapperId,
        and: children,
    };
};

/**
 * Denormalize a single filter tree back to nested Filters structure
 * Separates rules by groupKey into dimensions/metrics/tableCalculations
 * @param tree - The normalized filter tree
 * @returns Standard nested Filters object for API
 */
export const denormalizeFilters = (tree: FilterTreeState): Filters => {
    if (!tree.rootId) {
        return {};
    }

    const rootNode = tree.byId[tree.rootId];
    if (!rootNode || rootNode.type !== 'group') {
        return {};
    }

    // Group child nodes by their groupKey
    const dimensionChildIds: string[] = [];
    const metricChildIds: string[] = [];
    const tableCalculationChildIds: string[] = [];

    const categorizeNode = (nodeId: string) => {
        const node = tree.byId[nodeId];
        if (!node) return;

        if (node.type === 'rule') {
            // Add to appropriate category based on groupKey
            if (node.groupKey === 'dimensions') {
                dimensionChildIds.push(nodeId);
            } else if (node.groupKey === 'metrics') {
                metricChildIds.push(nodeId);
            } else if (node.groupKey === 'tableCalculations') {
                tableCalculationChildIds.push(nodeId);
            }
        } else {
            // For groups, check first child to determine category
            if (node.childIds.length > 0) {
                const firstChild = tree.byId[node.childIds[0]];
                if (firstChild?.type === 'rule') {
                    if (firstChild.groupKey === 'dimensions') {
                        dimensionChildIds.push(nodeId);
                    } else if (firstChild.groupKey === 'metrics') {
                        metricChildIds.push(nodeId);
                    } else if (firstChild.groupKey === 'tableCalculations') {
                        tableCalculationChildIds.push(nodeId);
                    }
                } else {
                    // Recursively check all nested groups
                    node.childIds.forEach(categorizeNode);
                }
            }
        }
    };

    rootNode.childIds.forEach(categorizeNode);

    return {
        dimensions: buildFilterGroup(tree, dimensionChildIds, 'dimensions'),
        metrics: buildFilterGroup(tree, metricChildIds, 'metrics'),
        tableCalculations: buildFilterGroup(
            tree,
            tableCalculationChildIds,
            'tableCalculations',
        ),
    };
};

/**
 * Create an empty filter tree with a root AND group
 * @returns Empty filter tree with root node
 */
export const createEmptyFilterTree = (): FilterTreeState => {
    const rootId = uuidv4();
    return {
        byId: {
            [rootId]: {
                type: 'group',
                id: rootId,
                operator: FilterGroupOperator.and,
                childIds: [],
                parentId: null,
            },
        },
        rootId,
    };
};

/**
 * Add a filter rule to a parent group in the tree
 * @param tree - The filter tree to modify (with immer)
 * @param parentId - ID of the parent group
 * @param groupKey - The groupKey for this rule (dimensions/metrics/tableCalculations)
 * @param rule - The filter rule to add
 * @param index - Optional index to insert at (default: append to end)
 */
export const addFilterRuleToTree = (
    tree: FilterTreeState,
    parentId: string,
    groupKey: FilterTreeGroupKey,
    rule: FilterRule,
    index?: number,
): void => {
    const parent = tree.byId[parentId];

    if (!parent || parent.type !== 'group') {
        throw new Error(`Parent ${parentId} is not a valid group`);
    }

    const ruleNode: Extract<FilterTreeNode, { type: 'rule' }> = {
        type: 'rule',
        id: rule.id,
        groupKey,
        rule,
        parentId,
    };

    // Add node to byId
    tree.byId[rule.id] = ruleNode;

    // Add to parent's children
    if (index !== undefined) {
        parent.childIds.splice(index, 0, rule.id);
    } else {
        parent.childIds.push(rule.id);
    }
};

/**
 * Remove a node from the tree (and all its descendants if it's a group)
 * @param tree - The filter tree to modify (with immer)
 * @param nodeId - ID of the node to remove
 */
export const removeNodeFromTree = (
    tree: FilterTreeState,
    nodeId: string,
): void => {
    const node = tree.byId[nodeId];

    if (!node) {
        return; // Already removed
    }

    // Remove from parent's childIds
    if (node.parentId) {
        const parent = tree.byId[node.parentId];
        if (parent && parent.type === 'group') {
            parent.childIds = parent.childIds.filter((id) => id !== nodeId);
        }
    }

    // If it's a group, recursively remove all children
    if (node.type === 'group') {
        node.childIds.forEach((childId) => removeNodeFromTree(tree, childId));
    }

    // Remove the node itself
    delete tree.byId[nodeId];
};

/**
 * Move a node to a new parent or reorder within the same parent
 * @param tree - The filter tree to modify (with immer)
 * @param nodeId - ID of the node to move
 * @param newParentId - ID of the new parent group
 * @param index - Index in the new parent's children (default: append)
 */
export const moveNode = (
    tree: FilterTreeState,
    nodeId: string,
    newParentId: string,
    index?: number,
): void => {
    const node = tree.byId[nodeId];
    const newParent = tree.byId[newParentId];

    if (!node) {
        throw new Error(`Node ${nodeId} not found`);
    }

    if (!newParent || newParent.type !== 'group') {
        throw new Error(`New parent ${newParentId} is not a valid group`);
    }

    // Remove from old parent
    if (node.parentId) {
        const oldParent = tree.byId[node.parentId];
        if (oldParent && oldParent.type === 'group') {
            oldParent.childIds = oldParent.childIds.filter(
                (id) => id !== nodeId,
            );
        }
    }

    // Update parent reference
    node.parentId = newParentId;

    // Add to new parent
    if (index !== undefined) {
        newParent.childIds.splice(index, 0, nodeId);
    } else {
        newParent.childIds.push(nodeId);
    }
};

/**
 * Update a filter rule in the tree
 * @param tree - The filter tree to modify (with immer)
 * @param ruleId - ID of the rule to update
 * @param updates - Partial updates to apply to the rule
 * @param fieldsMap - Map of all fields available by index, to infer the groupKey
 */
export const updateFilterRule = (
    tree: FilterTreeState,
    ruleId: string,
    updates: Partial<FilterRule>,
    groupKey: 'metrics' | 'dimensions' | 'tableCalculations',
): void => {
    const node = tree.byId[ruleId];

    if (!node || node.type !== 'rule') {
        throw new Error(`Rule ${ruleId} not found`);
    }

    // IMPORTANT: Preserve the node ID - it's the stable identifier
    // If updates contain an 'id' field, ignore it to maintain tree integrity
    const { id: _ignoredId, ...safeUpdates } = updates;

    // Update the rule, but ensure the ID remains stable
    node.rule = { ...node.rule, ...safeUpdates, id: ruleId };
    node.groupKey = groupKey;
};

/**
 * Set a group's operator to a specific value (AND or OR)
 * Root node: creates/flattens child groups by filter type instead of changing root operator
 * Non-root: sets operator and merges into parent if operators match (deduplication)
 * @param tree - The filter tree to modify (with immer)
 * @param groupId - ID of the group to modify
 * @param operator - The operator to set (AND or OR)
 */
export const setGroupOperator = (
    tree: FilterTreeState,
    groupId: string,
    operator: FilterGroupOperator,
): void => {
    const node = tree.byId[groupId];

    if (!node || node.type !== 'group') {
        throw new Error(`Group ${groupId} not found`);
    }

    // Root node - special handling
    if (groupId === tree.rootId) {
        // Root always stays AND - we create/flatten child groups instead
        if (operator === FilterGroupOperator.or) {
            // User wants OR → flatten all rules and create OR groups by filter type
            const rulesByType = {
                dimensions: [] as string[],
                metrics: [] as string[],
                tableCalculations: [] as string[],
            };

            // Recursively collect all rules, delete intermediate groups
            const collectRules = (nodeId: string): void => {
                const child = tree.byId[nodeId];
                if (!child) return;

                if (child.type === 'rule') {
                    rulesByType[child.groupKey].push(nodeId);
                } else {
                    child.childIds.forEach(collectRules);
                    delete tree.byId[nodeId];
                }
            };

            node.childIds.forEach(collectRules);

            // Create OR group for each type with rules
            const createOrGroup = (ruleIds: string[]): string | null => {
                if (ruleIds.length === 0) return null;

                const newGroupId = uuidv4();
                tree.byId[newGroupId] = {
                    type: 'group',
                    id: newGroupId,
                    operator: FilterGroupOperator.or,
                    childIds: ruleIds,
                    parentId: groupId,
                };

                ruleIds.forEach((ruleId) => {
                    const rule = tree.byId[ruleId];
                    if (rule) rule.parentId = newGroupId;
                });

                return newGroupId;
            };

            node.childIds = [
                createOrGroup(rulesByType.dimensions),
                createOrGroup(rulesByType.metrics),
                createOrGroup(rulesByType.tableCalculations),
            ].filter((id): id is string => id !== null);
        } else {
            // User wants AND → flatten all child groups
            const allRules: string[] = [];

            const collectRules = (nodeId: string): void => {
                const child = tree.byId[nodeId];
                if (!child) return;

                if (child.type === 'rule') {
                    child.parentId = groupId;
                    allRules.push(nodeId);
                } else {
                    child.childIds.forEach(collectRules);
                    delete tree.byId[nodeId];
                }
            };

            node.childIds.forEach(collectRules);
            node.childIds = allRules;
        }
        return;
    }

    // Non-root node - check if already set to desired operator
    if (node.operator === operator) {
        return; // Already set, nothing to do
    }

    // Set the operator
    node.operator = operator;

    // Check if we should merge with parent (deduplication)
    if (!node.parentId) return;

    const parent = tree.byId[node.parentId];
    if (
        !parent ||
        parent.type !== 'group' ||
        parent.operator !== node.operator
    ) {
        return; // Parent doesn't match, keep as separate group
    }

    // Helper to recursively flatten groups with matching operator into target parent
    const flattenMatchingGroups = (
        targetParent: Extract<FilterTreeNode, { type: 'group' }>,
        childIds: string[],
    ): string[] => {
        const result: string[] = [];

        childIds.forEach((childId) => {
            const child = tree.byId[childId];
            if (!child) return;

            // Update parent reference
            child.parentId = targetParent.id;

            if (
                child.type === 'group' &&
                child.operator === targetParent.operator
            ) {
                // Same operator - flatten recursively and delete this group
                const flattenedChildren = flattenMatchingGroups(
                    targetParent,
                    child.childIds,
                );
                result.push(...flattenedChildren);
                delete tree.byId[childId];
            } else {
                // Different operator or rule - keep as is
                result.push(childId);
            }
        });

        return result;
    };

    // Merge into parent
    const groupIndex = parent.childIds.indexOf(groupId);
    if (groupIndex === -1) return;

    // Recursively flatten children with matching operator
    const flattenedChildren = flattenMatchingGroups(parent, node.childIds);

    // Replace this group with flattened children
    parent.childIds.splice(groupIndex, 1, ...flattenedChildren);

    // Remove merged group
    delete tree.byId[groupId];
};

/**
 * Convert a filter rule to a group containing that rule
 * @param tree - The filter tree to modify (with immer)
 * @param ruleId - ID of the rule to convert
 * @param newGroupId - ID for the new group to create
 * @param operator - Operator for the new group (AND or OR)
 */
export const convertRuleToGroup = (
    tree: FilterTreeState,
    ruleId: string,
    newGroupId: string,
    operator: FilterGroupOperator,
): void => {
    const ruleNode = tree.byId[ruleId];

    if (!ruleNode || ruleNode.type !== 'rule') {
        throw new Error(`Rule ${ruleId} not found`);
    }

    const parentId = ruleNode.parentId;

    if (!parentId) {
        throw new Error(`Rule ${ruleId} has no parent`);
    }

    const parent = tree.byId[parentId];

    if (!parent || parent.type !== 'group') {
        throw new Error(`Parent ${parentId} is not a valid group`);
    }

    // Find the index of the rule in the parent's children
    const ruleIndex = parent.childIds.indexOf(ruleId);

    if (ruleIndex === -1) {
        throw new Error(`Rule ${ruleId} not found in parent ${parentId}`);
    }

    // Create new group node containing the rule
    const newGroup: Extract<FilterTreeNode, { type: 'group' }> = {
        type: 'group',
        id: newGroupId,
        operator,
        childIds: [ruleId],
        parentId,
    };

    // Add new group to tree
    tree.byId[newGroupId] = newGroup;

    // Update rule's parent to the new group (groupKey stays the same)
    ruleNode.parentId = newGroupId;

    // Replace rule with group in parent's children
    parent.childIds[ruleIndex] = newGroupId;
};
