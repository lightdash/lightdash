import {
    createFilterRuleFromField,
    type FilterOperator,
    FilterType,
    getFilterRuleFromFieldWithDefaultValue,
    getFilterTypeFromItem,
    getItemId,
    isDateItem,
    type FilterableField,
    type FilterRule,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Menu, Select, Tooltip } from '@mantine-8/core';
import { IconDots, IconX } from '@tabler/icons-react';
import { memo, useCallback, useMemo, type FC } from 'react';
import FieldSelect from '../FieldSelect';
import MantineIcon from '../MantineIcon';
import { FILTER_SELECT_LIMIT } from './constants';
import FilterInputComponent from './FilterInputs';
import { filterOperatorDescription } from './FilterInputs/constants';
import { getFilterOperatorOptions } from './FilterInputs/utils';
import useFiltersContext from './useFiltersContext';

type Props = {
    fields: FilterableField[];
    filterRule: FilterRule;
    isEditMode: boolean;
    onChange: (value: FilterRule) => void;
    onDelete: () => void;
    onConvertToGroup?: () => void;
};

const FilterRuleForm: FC<Props> = memo(
    ({
        fields,
        filterRule,
        isEditMode,
        onChange,
        onDelete,
        onConvertToGroup,
    }) => {
        const { popoverProps, baseTable } = useFiltersContext();
        const activeField = useMemo(() => {
            return fields.find(
                (field) => getItemId(field) === filterRule.target.fieldId,
            );
        }, [fields, filterRule.target.fieldId]);

        const filterType = useMemo(() => {
            return activeField
                ? getFilterTypeFromItem(activeField)
                : FilterType.STRING;
        }, [activeField]);

        const filterOperatorOptions = useMemo(() => {
            return getFilterOperatorOptions(filterType, activeField);
        }, [filterType, activeField]);

        const onFieldChange = useCallback(
            (fieldId: string) => {
                const selectedField = fields.find(
                    (field) => getItemId(field) === fieldId,
                );
                if (selectedField && activeField) {
                    if (selectedField.type === activeField.type) {
                        const newFilterRuleBase = {
                            ...filterRule,
                            target: {
                                fieldId,
                            },
                        };

                        const newFilterRule = isDateItem(selectedField)
                            ? // If the field is the same type but different field, we need to update the filter rule with the new time frames
                              getFilterRuleFromFieldWithDefaultValue(
                                  selectedField,
                                  newFilterRuleBase,
                                  filterRule.values,
                              )
                            : newFilterRuleBase;

                        onChange(newFilterRule);
                    } else {
                        onChange(createFilterRuleFromField(selectedField));
                    }
                }
            },
            [activeField, fields, filterRule, onChange],
        );
        const isRequired = filterRule.required;
        const isRequiredLabel = isRequired
            ? 'This is a required filter defined in the model configuration and cannot be removed.'
            : '';

        const availableFields = useMemo(() => {
            if (!isRequired) return fields;
            // For required filters, restrict to same-type sub-dimensions
            const baseFieldId = filterRule.target.fieldId;
            return fields.filter(
                (field) =>
                    getItemId(field).startsWith(baseFieldId) &&
                    getFilterTypeFromItem(field) === filterType,
            );
        }, [isRequired, fields, filterRule.target.fieldId, filterType]);

        const isFieldSelectDisabled =
            !isEditMode || (isRequired && availableFields.length <= 1);

        if (!activeField) {
            return null;
        }

        return (
            <Group
                wrap="nowrap"
                align="start"
                gap="xs"
                data-testid="FilterRuleForm/filter-rule"
            >
                <Tooltip
                    label={isRequiredLabel}
                    disabled={!isFieldSelectDisabled}
                    withinPortal
                    variant="xs"
                    multiline
                >
                    <Box>
                        <FieldSelect
                            size="xs"
                            disabled={isFieldSelectDisabled}
                            comboboxProps={{
                                withinPortal: popoverProps?.withinPortal,
                            }}
                            onDropdownOpen={popoverProps?.onOpen}
                            onDropdownClose={popoverProps?.onClose}
                            hasGrouping
                            item={activeField}
                            items={availableFields}
                            onChange={(field) => {
                                if (!field) return;
                                onFieldChange(getItemId(field));
                            }}
                            baseTable={baseTable}
                        />
                    </Box>
                </Tooltip>
                <Select
                    limit={FILTER_SELECT_LIMIT}
                    size="xs"
                    w="175px"
                    style={{ flexShrink: 0 }}
                    onDropdownOpen={popoverProps?.onOpen}
                    onDropdownClose={popoverProps?.onClose}
                    disabled={!isEditMode}
                    value={filterRule.operator}
                    data={filterOperatorOptions}
                    renderOption={({ option }) => {
                        const description =
                            filterOperatorDescription[
                                option.value as FilterOperator
                            ];
                        if (description) {
                            return (
                                <Tooltip
                                    label={description}
                                    position="right"
                                    multiline
                                    maw={300}
                                    withinPortal
                                >
                                    <span>{option.label}</span>
                                </Tooltip>
                            );
                        }
                        return <span>{option.label}</span>;
                    }}
                    onChange={(value) => {
                        if (!value) return;
                        onChange(
                            getFilterRuleFromFieldWithDefaultValue(
                                activeField,
                                {
                                    ...filterRule,
                                    operator: value as FilterRule['operator'],
                                },
                                filterRule.values ?? [],
                            ),
                        );
                    }}
                />

                <FilterInputComponent
                    filterType={filterType}
                    field={activeField}
                    rule={filterRule}
                    onChange={onChange}
                    disabled={!isEditMode}
                    popoverProps={popoverProps}
                />

                {isEditMode &&
                    (!onConvertToGroup ? (
                        <Tooltip
                            label={isRequiredLabel}
                            disabled={!isRequired}
                            withinPortal
                            variant="xs"
                            multiline
                        >
                            <span>
                                <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    onClick={onDelete}
                                    disabled={isRequired}
                                    data-testid="delete-filter-rule-button"
                                >
                                    <MantineIcon icon={IconX} size="sm" />
                                </ActionIcon>
                            </span>
                        </Tooltip>
                    ) : isRequired ? (
                        <Tooltip
                            label={isRequiredLabel}
                            withinPortal
                            variant="xs"
                            multiline
                        >
                            <span>
                                <ActionIcon variant="subtle" disabled>
                                    <IconDots size="20" />
                                </ActionIcon>
                            </span>
                        </Tooltip>
                    ) : (
                        <Menu
                            position="bottom-end"
                            shadow="md"
                            closeOnItemClick
                            withArrow
                            arrowPosition="center"
                            withinPortal
                        >
                            <Menu.Target>
                                <Box>
                                    <ActionIcon variant="subtle">
                                        <IconDots size="20" />
                                    </ActionIcon>
                                </Box>
                            </Menu.Target>

                            <Menu.Dropdown>
                                <Menu.Item onClick={onConvertToGroup}>
                                    Convert to group
                                </Menu.Item>
                                <Menu.Item color="red" onClick={onDelete}>
                                    Remove
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    ))}
            </Group>
        );
    },
);

FilterRuleForm.displayName = 'FilterRuleForm';

export default FilterRuleForm;
