import {
    ConditionalOperator,
    createFilterRuleFromField,
    FieldTarget,
    FilterRule,
    getFieldRef,
    isDimension,
} from '@lightdash/common';
import { Button, Stack } from '@mantine/core';
import { Dispatch, FC, SetStateAction, useCallback } from 'react';
import {
    ExploreMode,
    useExplorerContext,
} from '../../../providers/ExplorerProvider';
import FilterRuleForm from '../../common/Filters/FilterRuleForm';
import { useFiltersContext } from '../../common/Filters/FiltersProvider';
import { addFieldRefToFilterRule } from './utils';

export interface MetricFilterRuleWithFieldId
    extends FilterRule<
        ConditionalOperator,
        FieldTarget & { fieldRef: string }
    > {}

export const FilterForm: FC<{
    defaultFilterRuleFieldId: string | undefined;
    customMetricFiltersWithIds: MetricFilterRuleWithFieldId[];
    setCustomMetricFiltersWithIds: Dispatch<
        SetStateAction<MetricFilterRuleWithFieldId[]>
    >;
}> = ({
    defaultFilterRuleFieldId,
    customMetricFiltersWithIds,
    setCustomMetricFiltersWithIds,
}) => {
    const isEditMode = useExplorerContext(
        (context) => context.state.mode === ExploreMode.EDIT,
    );
    const { fieldsMap } = useFiltersContext();

    const dimensions = Object.values(fieldsMap).filter(isDimension);

    const addFieldRule = useCallback(() => {
        const fallbackField = Object.values(fieldsMap)[0];
        const defaultField = defaultFilterRuleFieldId
            ? fieldsMap[defaultFilterRuleFieldId]
            : undefined;
        const field = defaultField || fallbackField;

        if (!field) {
            return;
        }

        const newFilterRule = createFilterRuleFromField(field);
        setCustomMetricFiltersWithIds([
            ...customMetricFiltersWithIds,
            {
                ...newFilterRule,
                target: {
                    fieldId: newFilterRule.target.fieldId,
                    fieldRef: getFieldRef(field),
                },
            },
        ]);
    }, [
        customMetricFiltersWithIds,
        defaultFilterRuleFieldId,
        fieldsMap,
        setCustomMetricFiltersWithIds,
    ]);

    const onChangeItem = useCallback(
        (itemIndex: number, filterRule: FilterRule) => {
            setCustomMetricFiltersWithIds(
                customMetricFiltersWithIds.map((customMetricFilter, index) =>
                    itemIndex === index
                        ? addFieldRefToFilterRule(filterRule, fieldsMap)
                        : customMetricFilter,
                ),
            );
        },
        [customMetricFiltersWithIds, fieldsMap, setCustomMetricFiltersWithIds],
    );

    const onDeleteItem = useCallback(
        (index: number) => {
            setCustomMetricFiltersWithIds(
                customMetricFiltersWithIds.filter((_value, i) => i !== index),
            );
        },
        [customMetricFiltersWithIds, setCustomMetricFiltersWithIds],
    );

    return (
        <Stack spacing="sm">
            {customMetricFiltersWithIds.map((filterRule, index) => (
                <FilterRuleForm
                    key={filterRule.id}
                    filterRule={filterRule}
                    fields={dimensions}
                    isEditMode={isEditMode}
                    onChange={(value) => onChangeItem(index, value)}
                    onDelete={() => onDeleteItem(index)}
                />
            ))}
            <Button
                display="block"
                mr="auto"
                size="xs"
                variant="outline"
                onClick={() => {
                    addFieldRule();
                }}
                disabled={dimensions.length <= 0}
            >
                Add filter
            </Button>
        </Stack>
    );
};
