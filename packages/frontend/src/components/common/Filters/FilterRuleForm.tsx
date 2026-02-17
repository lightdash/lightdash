import {
    FilterType,
    createFilterRuleFromField,
    getFilterRuleFromFieldWithDefaultValue,
    getFilterTypeFromItem,
    getItemId,
    isDateItem,
    type FilterRule,
    type FilterableField,
} from '@lightdash/common';
import { Menu } from '@mantine-8/core';
import { ActionIcon, Box, Group, Select, Tooltip } from '@mantine/core';
import { IconDots, IconX } from '@tabler/icons-react';
import { memo, useCallback, useMemo, type FC } from 'react';
import FieldSelect from '../FieldSelect';
import MantineIcon from '../MantineIcon';
import { FILTER_SELECT_LIMIT } from './constants';
import FilterInputComponent from './FilterInputs';
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
            return getFilterOperatorOptions(filterType);
        }, [filterType]);

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
            ? 'This is a required filter defined in the model configuration and cannot be modified.'
            : '';

        if (!activeField) {
            return null;
        }

        return (
            <Group
                noWrap
                align="start"
                spacing="xs"
                data-testid="FilterRuleForm/filter-rule"
            >
                <Tooltip
                    label={isRequiredLabel}
                    disabled={!isRequired}
                    withinPortal
                    variant="xs"
                    multiline
                >
                    <Box>
                        <FieldSelect
                            size="xs"
                            disabled={!isEditMode || isRequired}
                            withinPortal={popoverProps?.withinPortal}
                            onDropdownOpen={popoverProps?.onOpen}
                            onDropdownClose={popoverProps?.onClose}
                            hasGrouping
                            item={activeField}
                            items={fields}
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
                    sx={{ flexShrink: 0 }}
                    withinPortal={popoverProps?.withinPortal}
                    onDropdownOpen={popoverProps?.onOpen}
                    onDropdownClose={popoverProps?.onClose}
                    disabled={!isEditMode || isRequired}
                    value={filterRule.operator}
                    data={filterOperatorOptions}
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
                    disabled={!isEditMode || isRequired}
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
