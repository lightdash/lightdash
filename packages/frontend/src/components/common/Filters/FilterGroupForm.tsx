import {
    createFilterRuleFromField,
    FilterGroupOperator,
    getFilterGroupItemsPropertyName,
    getFiltersFromGroup,
    getItemsFromFilterGroup,
    getSupportedFilterRule,
    isAndFilterGroup,
    isCustomSqlDimension,
    isDimension,
    isFilterGroup,
    isMetric,
    isTableCalculation,
    type CustomSqlDimension,
    type FilterableDimension,
    type FilterableField,
    type FilterGroup,
    type FilterRule,
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
import { v4 as uuidv4 } from 'uuid';
import {
    getLiveSourceFilterGroups,
    getLiveSourceSupportedOperators,
    isFilterableOnLiveSource,
} from '../../../features/externalConnections/liveSources/apiSourceExplore';
import MantineIcon from '../MantineIcon';
import { FILTER_SELECT_LIMIT } from './constants';
import FilterRuleForm from './FilterRuleForm';
import classes from './Filters.module.css';
import useFiltersContext from './useFiltersContext';

type Props = {
    hideButtons?: boolean;
    hideLine?: boolean;
    groupDepth?: number;
    fields: FilterableField[];
    filterGroup: FilterGroup;
    isEditMode: boolean;
    onChange: (value: FilterGroup) => void;
    onDelete: () => void;
};

const ALLOW_CONVERT_TO_GROUP_UP_TO_DEPTH = 2;

const AddFilterButton: FC<{ onClick: () => void }> = ({ onClick }) => {
    return (
        <Box pos="relative" className={classes.raised}>
            <Button
                variant="light"
                size="xs"
                leftSection={<MantineIcon icon={IconPlus} />}
                onClick={onClick}
            >
                Add group rule
            </Button>
        </Box>
    );
};

const FilterGroupForm: FC<Props> = memo(
    ({
        hideButtons,
        hideLine,
        groupDepth = 0,
        fields,
        filterGroup,
        isEditMode,
        onChange,
        onDelete,
    }) => {
        const items = getItemsFromFilterGroup(filterGroup);
        const [conditionLabel, setConditionLabel] = useState('');
        const { apiSource } = useFiltersContext();
        const liveSourceGroups = getLiveSourceFilterGroups(apiSource);
        // Inside an AND group the new group is an OR group
        const canConvertToGroup =
            ALLOW_CONVERT_TO_GROUP_UP_TO_DEPTH > groupDepth &&
            liveSourceGroups.nestedGroups &&
            (liveSourceGroups.or || !isAndFilterGroup(filterGroup));

        const [dimensions, metrics, tableCalculations] = useMemo<
            [
                Array<FilterableDimension | CustomSqlDimension>,
                Metric[],
                TableCalculation[],
            ]
        >(() => {
            return [
                [
                    ...fields.filter(isDimension),
                    ...fields.filter(isCustomSqlDimension),
                ],
                fields.filter(isMetric),
                fields.filter(isTableCalculation),
            ];
        }, [fields]);

        const availableFieldsForGroupRules = useMemo<FilterableField[]>(() => {
            // If the group is an AND group, we can use all fields
            if (isAndFilterGroup(filterGroup)) {
                return [...dimensions, ...metrics, ...tableCalculations];
            }

            // If the group is an OR group, we can only use fields that are of the same type
            const filters = getFiltersFromGroup(filterGroup, fields);
            if (filters.dimensions) {
                setConditionLabel('dimension');
                return dimensions;
            }

            if (filters.metrics) {
                setConditionLabel('metric');
                return metrics;
            }

            if (filters.tableCalculations) {
                setConditionLabel('table calculation');
                return tableCalculations;
            }

            return [];
        }, [dimensions, fields, filterGroup, metrics, tableCalculations]);

        const onDeleteItem = useCallback(
            (index: number) => {
                if (items.length <= 1) {
                    onDelete();
                } else {
                    onChange({
                        ...filterGroup,
                        [getFilterGroupItemsPropertyName(filterGroup)]: [
                            ...items.slice(0, index),
                            ...items.slice(index + 1),
                        ],
                    });
                }
            },
            [filterGroup, items, onChange, onDelete],
        );

        const onChangeItem = useCallback(
            (index: number, item: FilterRule | FilterGroup) => {
                onChange({
                    ...filterGroup,
                    [getFilterGroupItemsPropertyName(filterGroup)]: [
                        ...items.slice(0, index),
                        item,
                        ...items.slice(index + 1),
                    ],
                });
            },
            [filterGroup, items, onChange],
        );

        const addableFields = useMemo(
            () =>
                availableFieldsForGroupRules.filter((field) =>
                    isFilterableOnLiveSource(apiSource, field),
                ),
            [availableFieldsForGroupRules, apiSource],
        );

        const onAddFilterRule = useCallback(() => {
            if (addableFields.length > 0) {
                onChange({
                    ...filterGroup,
                    [getFilterGroupItemsPropertyName(filterGroup)]: [
                        ...items,
                        getSupportedFilterRule(
                            addableFields[0],
                            createFilterRuleFromField(addableFields[0]),
                            getLiveSourceSupportedOperators(
                                apiSource,
                                addableFields[0],
                            ),
                        ),
                    ],
                });
            }
        }, [addableFields, apiSource, filterGroup, items, onChange]);

        const onChangeOperator = useCallback(
            (value: FilterGroupOperator) => {
                onChange({
                    id: filterGroup.id,
                    [value]: items,
                } as FilterGroup);
            },
            [filterGroup, items, onChange],
        );

        return (
            <Stack pos="relative" gap="sm" mb="xxs">
                {!hideLine && (
                    <Divider
                        orientation="vertical"
                        pos="absolute"
                        h="100%"
                        top={0}
                        left={18}
                        className={classes.groupLine}
                    />
                )}

                <Group gap="xs">
                    <Box pos="relative" className={classes.operatorSelect}>
                        <Select
                            limit={FILTER_SELECT_LIMIT}
                            size="xs"
                            w={70}
                            disabled={!isEditMode}
                            data={[
                                {
                                    value: FilterGroupOperator.and,
                                    label: 'All',
                                },
                                {
                                    value: FilterGroupOperator.or,
                                    label: 'Any',
                                    disabled:
                                        !liveSourceGroups.or &&
                                        isAndFilterGroup(filterGroup),
                                },
                            ]}
                            value={
                                isAndFilterGroup(filterGroup)
                                    ? FilterGroupOperator.and
                                    : FilterGroupOperator.or
                            }
                            onChange={(operator) =>
                                operator &&
                                onChangeOperator(
                                    operator as FilterGroupOperator,
                                )
                            }
                        />
                    </Box>

                    <Text c="dimmed" size="xs">
                        of the following {conditionLabel} conditions match:
                    </Text>
                </Group>

                <Stack gap="xs" pl={36} className={classes.groupItems}>
                    {items.map((item, index) => (
                        <React.Fragment key={item.id}>
                            {!isFilterGroup(item) ? (
                                <FilterRuleForm
                                    filterRule={item}
                                    fields={availableFieldsForGroupRules}
                                    isEditMode={isEditMode}
                                    onChange={(value) =>
                                        onChangeItem(index, value)
                                    }
                                    onDelete={() => onDeleteItem(index)}
                                    onConvertToGroup={
                                        canConvertToGroup
                                            ? () =>
                                                  onChangeItem(
                                                      index,
                                                      // create new group with opposite operator
                                                      isAndFilterGroup(
                                                          filterGroup,
                                                      )
                                                          ? {
                                                                id: uuidv4(),
                                                                or: [item],
                                                            }
                                                          : {
                                                                id: uuidv4(),
                                                                and: [item],
                                                            },
                                                  )
                                            : undefined
                                    }
                                />
                            ) : (
                                <FilterGroupForm
                                    groupDepth={groupDepth + 1}
                                    isEditMode={isEditMode}
                                    filterGroup={item}
                                    fields={availableFieldsForGroupRules}
                                    onChange={(value) =>
                                        onChangeItem(index, value)
                                    }
                                    onDelete={() => onDeleteItem(index)}
                                />
                            )}
                        </React.Fragment>
                    ))}
                </Stack>

                {isEditMode && !hideButtons && addableFields.length > 0 && (
                    <AddFilterButton onClick={onAddFilterRule} />
                )}
            </Stack>
        );
    },
);

FilterGroupForm.displayName = 'FilterGroupForm';

export default FilterGroupForm;
