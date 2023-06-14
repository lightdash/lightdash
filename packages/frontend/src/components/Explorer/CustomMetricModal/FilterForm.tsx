import {
    AdditionalMetric,
    ConditionalOperator,
    createFilterRuleFromField,
    Dimension,
    Field,
    FieldTarget,
    FilterRule,
    isDimension,
    isField,
    isFilterableField,
    TableCalculation,
} from '@lightdash/common';
import { Button, Stack } from '@mantine/core';
import { Dispatch, FC, SetStateAction, useCallback } from 'react';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import FilterRuleForm from '../../common/Filters/FilterRuleForm';
import { useFiltersContext } from '../../common/Filters/FiltersProvider';
import { addFieldRefToFilterRule } from './utils';

export interface MetricFilterRuleWithFieldId
    extends FilterRule<
        ConditionalOperator,
        FieldTarget & { fieldRef: string }
    > {}

export const FilterForm: FC<{
    item: Dimension;
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

    const addFieldRule = useCallback(
        (field: Field | TableCalculation | Dimension | AdditionalMetric) => {
            if ('baseFieldId' in field && field.baseFieldId) {
                const baseFieldName = `${field.table}_${field.baseFieldId}`;

                const baseField = fieldsMap[baseFieldName];
                const newFilterRule = createFilterRuleFromField(
                    fieldsMap[baseFieldName],
                );

                if (isField(baseField) && isFilterableField(baseField)) {
                    setCustomMetricFiltersWithIds([
                        ...customMetricFiltersWithIds,
                        {
                            ...newFilterRule,
                            target: {
                                ...newFilterRule.target,
                                fieldRef: `${baseField.table}.${baseField.name}`,
                            },
                        },
                    ]);
                }
            } else {
                if (isField(field) && isFilterableField(field)) {
                    const newFilterRule = createFilterRuleFromField(field);

                    setCustomMetricFiltersWithIds([
                        ...customMetricFiltersWithIds,
                        {
                            ...newFilterRule,
                            target: {
                                ...newFilterRule.target,
                                fieldRef: `${field.table}.${field.name}`,
                            },
                        },
                    ]);
                }
            }
        },
        [customMetricFiltersWithIds, fieldsMap, setCustomMetricFiltersWithIds],
    );

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
                    addFieldRule(item);
                }}
                disabled={dimensions.length <= 0}
            >
                Add filter
            </Button>
        </Stack>
    );
};
