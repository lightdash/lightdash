import {
    AdditionalMetric,
    ConditionalOperator,
    createFilterRuleFromField,
    Dimension,
    FieldTarget,
    FilterRule,
    getFieldRef,
    isAdditionalMetric,
    isDimension,
} from '@lightdash/common';
import { Button, Stack } from '@mantine/core';
import { Dispatch, FC, SetStateAction, useCallback } from 'react';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import FilterRuleForm from '../../common/Filters/FilterRuleForm';
import {
    FieldsWithSuggestions,
    useFiltersContext,
} from '../../common/Filters/FiltersProvider';
import { addFieldRefToFilterRule } from './utils';

const getField = (
    item: Dimension | AdditionalMetric,
    fieldsMap: FieldsWithSuggestions,
) => {
    // To add filters to an existing custom metric, we must use its base dimension
    if (
        isAdditionalMetric(item) &&
        'baseDimensionName' in item &&
        item.baseDimensionName
    ) {
        const baseFieldName = `${item.table}_${item.baseDimensionName}`;
        return fieldsMap[baseFieldName];
    } else if (isDimension(item)) {
        return item;
    }
};
export interface MetricFilterRuleWithFieldId
    extends FilterRule<
        ConditionalOperator,
        FieldTarget & { fieldRef: string }
    > {}

export const FilterForm: FC<{
    item: Dimension | AdditionalMetric;
    customMetricFiltersWithIds: MetricFilterRuleWithFieldId[];
    setCustomMetricFiltersWithIds: Dispatch<
        SetStateAction<MetricFilterRuleWithFieldId[]>
    >;
}> = ({ item, customMetricFiltersWithIds, setCustomMetricFiltersWithIds }) => {
    const isEditMode = useExplorerContext(
        (context) => context.state.isEditMode,
    );
    const { fieldsMap } = useFiltersContext();

    const dimensions = Object.values(fieldsMap).filter(isDimension);

    const addFieldRule = useCallback(() => {
        const field = getField(item, fieldsMap);
        if (!field) return;

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
        fieldsMap,
        item,
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
