import {
    FilterGroupOperator,
    createFilterRuleFromField,
    getGroupKey,
    isCustomSqlDimension,
    isDimension,
    isMetric,
    isTableCalculation,
    type CustomSqlDimension,
    type FilterRule,
    type FilterableDimension,
    type FilterableField,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import {
    Box,
    Button,
    Divider,
    Group,
    Select,
    Stack,
    Text,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import React, { memo, useCallback, useMemo, useState, type FC } from 'react';
import {
    explorerActions,
    useExplorerDispatch,
} from '../../../features/explorer/store';
import type { FilterTreeState } from '../../../features/explorer/store/filterTree';
import type { FieldsWithSuggestions } from '../../Explorer/FiltersCard/useFieldsWithSuggestions';
import MantineIcon from '../MantineIcon';
import FilterRuleForm from './FilterRuleForm';
import { FILTER_SELECT_LIMIT } from './constants';

/**
 * FilterGroupForm - Recursive component for editing nested filter groups
 *
 * ARCHITECTURE: Tree-based rendering with zero denormalization:
 * - Reads directly from filterTree.byId for O(1) access
 * - Uses atomic actions: removeFilterRuleFromTree, updateFilterRuleInTree, setFilterGroupOperator
 * - groupKey is stored in rule nodes - no need to pass or compute it!
 * - No FilterGroup conversion needed - renders from tree structure
 */

type Props = {
    hideButtons?: boolean;
    hideLine?: boolean;
    groupDepth?: number;
    fields: FilterableField[];
    itemsMap: FieldsWithSuggestions;
    groupId: string; // Tree node ID instead of FilterGroup
    filterTree: FilterTreeState; // Direct tree access
    isEditMode: boolean;
    onDelete?: () => void; // Optional: for synthetic root groups that need special handling
};

type FieldsForGroup = {
    dimensions: Array<FilterableDimension | CustomSqlDimension>;
    metrics: Metric[];
    tableCalculations: TableCalculation[];
};

const ALLOW_CONVERT_TO_GROUP_UP_TO_DEPTH = 2;

const FilterGroupForm: FC<Props> = memo(
    ({
        hideButtons,
        hideLine,
        groupDepth = 0,
        fields,
        itemsMap,
        groupId,
        filterTree,
        isEditMode,
        onDelete,
    }) => {
        const dispatch = useExplorerDispatch();
        const [conditionLabel, setConditionLabel] = useState('');

        // Read group node from tree (O(1) access)
        // Note: FilterGroupForm should only be called with valid group IDs
        const node = filterTree.byId[groupId];
        const groupNode = (node?.type === 'group' ? node : null) as Extract<
            typeof node,
            { type: 'group' }
        > | null;

        const { dimensions, metrics, tableCalculations } =
            useMemo<FieldsForGroup>(() => {
                return fields.reduce<FieldsForGroup>(
                    (acc, field) => {
                        if (isDimension(field) || isCustomSqlDimension(field)) {
                            return {
                                ...acc,
                                dimensions: [...acc.dimensions, field],
                            };
                        }

                        if (isMetric(field)) {
                            return {
                                ...acc,
                                metrics: [...acc.metrics, field],
                            };
                        }

                        if (isTableCalculation(field)) {
                            return {
                                ...acc,
                                tableCalculations: [
                                    ...acc.tableCalculations,
                                    field,
                                ],
                            };
                        }

                        return acc;
                    },
                    {
                        dimensions: [],
                        metrics: [],
                        tableCalculations: [],
                    },
                );
            }, [fields]);

        const availableFieldsForGroupRules = useMemo<FilterableField[]>(() => {
            if (!groupNode) return [];

            // If the group is root and an AND group, we can use all fields
            if (
                groupNode.operator === FilterGroupOperator.and &&
                groupNode.id === filterTree.rootId
            ) {
                return fields;
            }

            // In every other case we can only use fields of the same type
            // Determine type from existing children, or allow all if no children yet
            if (groupNode.childIds.length > 0) {
                // Find first rule child to determine the group type
                const firstRuleChild = groupNode.childIds
                    .map((id: string) => filterTree.byId[id])
                    .find(
                        (childNode: typeof filterTree.byId[string]) =>
                            childNode?.type === 'rule',
                    );

                if (firstRuleChild) {
                    // Read groupKey directly from rule node (no field lookup needed!)
                    const groupType = firstRuleChild.groupKey;
                    if (groupType === 'dimensions') {
                        setConditionLabel('dimension');
                        return dimensions;
                    }
                    if (groupType === 'metrics') {
                        setConditionLabel('metric');
                        return metrics;
                    }
                    if (groupType === 'tableCalculations') {
                        setConditionLabel('table calculation');
                        return tableCalculations;
                    }
                }
            }

            // No children yet, allow all fields
            return fields;
        }, [
            groupNode,
            fields,
            dimensions,
            metrics,
            tableCalculations,
            filterTree,
        ]);

        // Atomic O(1) deletion using filter tree
        const onDeleteItem = useCallback(
            (nodeId: string) => {
                if (groupNode && groupNode.childIds.length <= 1 && onDelete) {
                    // If this is the last child and parent provided onDelete, use it
                    onDelete();
                } else {
                    // Use atomic action to remove from tree
                    dispatch(
                        explorerActions.removeFilterRuleFromTree({
                            ruleId: nodeId,
                        }),
                    );
                }
            },
            [dispatch, groupNode, onDelete],
        );

        // Atomic O(1) update using filter tree
        // Note: This is only called for rules, not groups.
        // Groups use atomic actions directly (setFilterGroupOperator, etc.)
        const onChangeItem = useCallback(
            (ruleId: string, item: FilterRule) => {
                const targetItem = itemsMap[item.target.fieldId];

                if (targetItem) {
                    dispatch(
                        explorerActions.updateFilterRuleInTree({
                            ruleId,
                            updates: item,
                            groupKey: getGroupKey(targetItem),
                        }),
                    );
                }
            },
            [dispatch, itemsMap],
        );

        // Atomic O(1) add using filter tree
        const onAddFilterRule = useCallback(() => {
            if (availableFieldsForGroupRules.length > 0) {
                const field = availableFieldsForGroupRules[0];
                const newRule = createFilterRuleFromField(field);
                // Determine groupKey from the field we're adding
                const addGroupKey = getGroupKey(field) as
                    | 'dimensions'
                    | 'metrics'
                    | 'tableCalculations';
                dispatch(
                    explorerActions.addFilterRuleToTree({
                        groupKey: addGroupKey,
                        parentId: groupId,
                        rule: newRule,
                    }),
                );
            }
        }, [availableFieldsForGroupRules, dispatch, groupId]);

        // Atomic O(1) set operator using filter tree
        const onChangeOperator = useCallback(
            (operator: string | null) => {
                if (!operator) return;
                dispatch(
                    explorerActions.setFilterGroupOperator({
                        groupId,
                        operator: operator as FilterGroupOperator,
                    }),
                );
            },
            [dispatch, groupId],
        );

        const newGroupOperator = useMemo<FilterGroupOperator>(() => {
            if (!groupNode) return FilterGroupOperator.and;
            return groupNode.operator === FilterGroupOperator.and
                ? FilterGroupOperator.or
                : FilterGroupOperator.and;
        }, [groupNode]);

        // Validate group node after all hooks
        if (!groupNode) {
            return null;
        }

        return (
            <Stack pos="relative" spacing="sm" mb="xxs">
                {!hideLine && (
                    <Divider
                        orientation="vertical"
                        pos="absolute"
                        h="100%"
                        top={0}
                        left={18}
                        style={{ zIndex: 1 }}
                    />
                )}

                <Group spacing="xs">
                    <Box bg="white" pos="relative" style={{ zIndex: 3 }}>
                        <Select
                            limit={FILTER_SELECT_LIMIT}
                            size="xs"
                            w={70}
                            withinPortal
                            disabled={!isEditMode}
                            data={[
                                {
                                    value: FilterGroupOperator.and,
                                    label: 'All',
                                },
                                {
                                    value: FilterGroupOperator.or,
                                    label: 'Any',
                                },
                            ]}
                            value={groupNode.operator}
                            onChange={onChangeOperator}
                        />
                    </Box>

                    <Text color="dimmed" size="xs">
                        of the following {conditionLabel} conditions match:
                    </Text>
                </Group>

                <Stack
                    spacing="xs"
                    pl={36}
                    style={{ flexGrow: 1, overflowY: 'auto' }}
                >
                    {groupNode.childIds.map((childId) => {
                        const childNode = filterTree.byId[childId];
                        if (!childNode) return null;

                        return (
                            <React.Fragment key={childId}>
                                {childNode.type === 'rule' ? (
                                    <FilterRuleForm
                                        filterRule={childNode.rule}
                                        fields={availableFieldsForGroupRules}
                                        isEditMode={isEditMode}
                                        onChange={(value) =>
                                            onChangeItem(childNode.id, value)
                                        }
                                        onDelete={() => onDeleteItem(childId)}
                                        onConvertToGroup={
                                            ALLOW_CONVERT_TO_GROUP_UP_TO_DEPTH >
                                            groupDepth
                                                ? () => {
                                                      // Create new group with opposite operator
                                                      dispatch(
                                                          explorerActions.convertFilterRuleToGroup(
                                                              {
                                                                  ruleId: childId,
                                                                  newGroupOperator,
                                                              },
                                                          ),
                                                      );
                                                  }
                                                : undefined
                                        }
                                    />
                                ) : (
                                    <FilterGroupForm
                                        groupDepth={groupDepth + 1}
                                        isEditMode={isEditMode}
                                        groupId={childId}
                                        filterTree={filterTree}
                                        fields={availableFieldsForGroupRules}
                                        itemsMap={itemsMap}
                                        onDelete={() => onDeleteItem(childId)}
                                    />
                                )}
                            </React.Fragment>
                        );
                    })}
                </Stack>

                {isEditMode &&
                    !hideButtons &&
                    availableFieldsForGroupRules.length > 0 && (
                        <Box bg="white" pos="relative" style={{ zIndex: 2 }}>
                            <Button
                                variant="outline"
                                size="xs"
                                leftIcon={<MantineIcon icon={IconPlus} />}
                                onClick={onAddFilterRule}
                            >
                                Add group rule
                            </Button>
                        </Box>
                    )}
            </Stack>
        );
    },
);

FilterGroupForm.displayName = 'FilterGroupForm';

export default FilterGroupForm;
