import {
    getGroupKey,
    type FilterableField,
    type FilterRule,
} from '@lightdash/common';
import { Stack, Text, Tooltip } from '@mantine/core';
import { memo, useCallback, type FC } from 'react';
import {
    explorerActions,
    useExplorerDispatch,
} from '../../../features/explorer/store';
import type { FieldsWithSuggestions } from '../../Explorer/FiltersCard/useFieldsWithSuggestions';
import FilterRuleForm from './FilterRuleForm';

/**
 * SimplifiedFilterGroupForm - Simple flat list of filter rules (< 2 rules, no nesting)
 *
 * Uses atomic filter tree actions for O(1) updates:
 * - Delete: removeFilterRuleFromTree({ ruleId })
 * - Update: updateFilterRuleInTree({ ruleId, updates })
 *
 * With single tree architecture, groupKey is stored in nodes - no need to pass it!
 */

type Props = {
    fields: FilterableField[];
    itemsMap: FieldsWithSuggestions;
    filterRules: FilterRule[];
    isEditMode: boolean;
};

const SimplifiedFilterGroupForm: FC<Props> = memo(
    ({ isEditMode, fields, filterRules, itemsMap }) => {
        const dispatch = useExplorerDispatch();

        // Atomic O(1) deletion using filter tree
        const onDeleteItem = useCallback(
            (ruleId: string) => {
                dispatch(
                    explorerActions.removeFilterRuleFromTree({
                        ruleId,
                    }),
                );
            },
            [dispatch],
        );

        // Atomic O(1) update using filter tree
        const onChangeItem = useCallback(
            (ruleId: string, updates: FilterRule) => {
                const targetItem = itemsMap[updates.target.fieldId];
                if (targetItem) {
                    dispatch(
                        explorerActions.updateFilterRuleInTree({
                            ruleId,
                            updates,
                            groupKey: getGroupKey(targetItem),
                        }),
                    );
                }
            },
            [dispatch, itemsMap],
        );

        return (
            <Stack style={{ flexGrow: 1 }}>
                <Tooltip
                    label="You can only use the 'and' operator when combining metrics & dimensions"
                    disabled={filterRules.length > 1}
                    arrowPosition="center"
                >
                    <Text color="dimmed" size="xs">
                        All of the following conditions match:
                    </Text>
                </Tooltip>

                <Stack spacing="sm">
                    {filterRules.map((item) => (
                        <FilterRuleForm
                            isEditMode={isEditMode}
                            key={item.id}
                            filterRule={item}
                            fields={fields}
                            onChange={(value) => onChangeItem(item.id, value)}
                            onDelete={() => onDeleteItem(item.id)}
                        />
                    ))}
                </Stack>
            </Stack>
        );
    },
);

SimplifiedFilterGroupForm.displayName = 'SimplifiedFilterGroupForm';

export default SimplifiedFilterGroupForm;
