import {
    createFilterRuleFromField,
    fieldId as getFieldId,
    FilterType,
    getFilterRuleWithDefaultValue,
    getFilterTypeFromItem,
    isDimension,
    type FilterableField,
    type FilterRule,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Menu, Select } from '@mantine/core';
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
            (field) => getFieldId(field) === filterRule.target.fieldId,
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
                (field) => getFieldId(field) === fieldId,
            );
            if (selectedField && activeField) {
                if (selectedField.type === activeField.type) {
                    if (
                        isDimension(selectedField) &&
                        isDimension(activeField) &&
                        activeField.timeInterval !== selectedField.timeInterval
                    ) {
                        // If the time interval changes, we need to update the value to match the new time interval if it's converted to a YEAR timeframe
                        // Example: If the change is from month -> year, the value of the filter `2021-03-01` should be updated to `2021-01-01`
                        return onChange(
                            createFilterRuleFromField(
                                selectedField,
                                filterRule.values?.[0],
                            ),
                        );
                    }

                    return onChange({
                        ...filterRule,
                        target: {
                            fieldId,
                        },
                    });
                } else {
                    return onChange(createFilterRuleFromField(selectedField));
                }
            }
        },
        [activeField, fields, filterRule, onChange],
    );

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
                    onFieldChange(getFieldId(field));
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
                    <ActionIcon onClick={onDelete}>
                        <MantineIcon icon={IconX} size="sm" />
                    </ActionIcon>
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
                            <Menu.Item color="red" onClick={onDelete}>
                                Remove
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                ))}
        </Group>
    );
};

export default FilterRuleForm;
