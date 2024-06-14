import {
    createFilterRuleFromField,
    FilterType,
    getFilterRuleWithDefaultValue,
    getFilterTypeFromItem,
    getItemId,
    type FilterableField,
    type FilterRule,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Menu, Select, Tooltip } from '@mantine/core';
import { IconDots, IconX } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import FieldSelect from '../FieldSelect';
import MantineIcon from '../MantineIcon';
import { FilterInputComponent, getFilterOperatorOptions } from './FilterInputs';
import { useFiltersContext } from './FiltersProvider';

type Props = {
    fields: FilterableField[];
    filterRule: FilterRule;
    isEditMode: boolean;
    onChange: (value: FilterRule) => void;
    onDelete: () => void;
    onConvertToGroup?: () => void;
};

const FilterRuleForm: FC<Props> = ({
    fields,
    filterRule,
    isEditMode,
    onChange,
    onDelete,
    onConvertToGroup,
}) => {
    const { popoverProps } = useFiltersContext();
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
                    onChange({
                        ...filterRule,
                        target: {
                            fieldId,
                        },
                    });
                } else {
                    onChange(createFilterRuleFromField(selectedField));
                }
            }
        },
        [activeField, fields, filterRule, onChange],
    );
    const isRequired = filterRule.required;
    const isRequiredLabel = isRequired
        ? "This filter is a required filter.\n It can't be deleted, but the value can be changed."
        : '';

    if (!activeField) {
        return null;
    }

    return (
        <Group noWrap align="start" spacing="xs">
            <FieldSelect
                size="xs"
                disabled={!isEditMode}
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
            />
            <Select
                size="xs"
                w="150px"
                sx={{ flexShrink: 0 }}
                withinPortal={popoverProps?.withinPortal}
                onDropdownOpen={popoverProps?.onOpen}
                onDropdownClose={popoverProps?.onClose}
                disabled={!isEditMode}
                value={filterRule.operator}
                data={filterOperatorOptions}
                onChange={(value) => {
                    if (!value) return;

                    onChange(
                        getFilterRuleWithDefaultValue(
                            activeField,
                            {
                                ...filterRule,
                                operator: value as FilterRule['operator'],
                            },
                            (filterRule.values?.length || 0) > 0
                                ? filterRule.values
                                : [1],
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
                                onClick={onDelete}
                                disabled={isRequired}
                            >
                                <MantineIcon icon={IconX} size="sm" />
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
                            <Tooltip
                                label={isRequiredLabel}
                                disabled={!isRequired}
                                withinPortal
                                variant="xs"
                                multiline
                            >
                                <span>
                                    <Menu.Item
                                        color="red"
                                        disabled={isRequired}
                                        onClick={onDelete}
                                    >
                                        Remove
                                    </Menu.Item>
                                </span>
                            </Tooltip>
                        </Menu.Dropdown>
                    </Menu>
                ))}
        </Group>
    );
};

export default FilterRuleForm;
