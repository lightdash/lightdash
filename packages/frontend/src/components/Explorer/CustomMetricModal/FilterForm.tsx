import {
    createFilterRuleFromField,
    getFieldRef,
    isDimension,
    type ConditionalOperator,
    type FieldTarget,
    type FilterableDimension,
    type FilterRule,
} from '@lightdash/common';
import { Button, Stack } from '@mantine/core';
import {
    useCallback,
    type Dispatch,
    type FC,
    type SetStateAction,
} from 'react';
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
        (context) => context.state.isEditMode,
    );
    const { itemsMap: dimensionsMap } =
        useFiltersContext<Record<string, FilterableDimension>>();

    const dimensions = Object.values(dimensionsMap);

    const addFieldRule = useCallback(() => {
        const fallbackField = dimensions[0];
        const defaultField = defaultFilterRuleFieldId
            ? dimensionsMap[defaultFilterRuleFieldId]
            : undefined;
        const field = defaultField || fallbackField;

        if (!field) {
            return;
        }

        if (isDimension(field)) {
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
        }
    }, [
        customMetricFiltersWithIds,
        defaultFilterRuleFieldId,
        dimensions,
        dimensionsMap,
        setCustomMetricFiltersWithIds,
    ]);

    const onChangeItem = useCallback(
        (itemIndex: number, filterRule: FilterRule) => {
            setCustomMetricFiltersWithIds(
                customMetricFiltersWithIds.map((customMetricFilter, index) =>
                    itemIndex === index
                        ? addFieldRefToFilterRule(filterRule, dimensionsMap)
                        : customMetricFilter,
                ),
            );
        },
        [
            customMetricFiltersWithIds,
            dimensionsMap,
            setCustomMetricFiltersWithIds,
        ],
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
