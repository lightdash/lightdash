import {
    createFilterRuleFromField,
    fieldId as getFieldId,
    FilterableField,
    FilterRule,
    FilterType,
    getFilterRuleWithDefaultValue,
    getFilterTypeFromItem,
} from '@lightdash/common';
import { ActionIcon, Box, Menu, Select, Text } from '@mantine/core';
import { IconDots, IconX } from '@tabler/icons-react';
import { FC, useCallback, useMemo } from 'react';
import FieldSelect from '../FieldSelect';
import MantineIcon from '../MantineIcon';
import { FilterTypeConfig } from './configs';
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
    const { inModal } = useFiltersContext();
    const activeField = fields.find(
        (field) => getFieldId(field) === filterRule.target.fieldId,
    );

    const filterType = activeField
        ? getFilterTypeFromItem(activeField)
        : FilterType.STRING;
    const filterConfig = useMemo(
        () => FilterTypeConfig[filterType],
        [filterType],
    );

    const onFieldChange = useCallback(
        (fieldId: string) => {
            const selectedField = fields.find(
                (field) => getFieldId(field) === fieldId,
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

    return (
        <div
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                flex: 1,
            }}
        >
            {activeField ? (
                <>
                    <FieldSelect
                        size="xs"
                        disabled={!isEditMode}
                        withinPortal={inModal}
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
                        withinPortal={inModal}
                        disabled={!isEditMode}
                        value={filterRule.operator}
                        data={filterConfig.operatorOptions}
                        onChange={(value) => {
                            if (!value) return;

                            onChange(
                                getFilterRuleWithDefaultValue(
                                    activeField,
                                    {
                                        ...filterRule,
                                        operator:
                                            value as FilterRule['operator'],
                                    },
                                    (filterRule.values?.length || 0) > 0
                                        ? filterRule.values
                                        : [1],
                                ),
                            );
                        }}
                    />

                    <filterConfig.inputs
                        filterType={filterType}
                        field={activeField}
                        rule={filterRule}
                        onChange={onChange}
                        disabled={!isEditMode}
                        inModal={inModal}
                    />
                </>
            ) : (
                <Text color="dimmed">
                    Tried to reference field with unknown id:{' '}
                    {filterRule.target.fieldId}
                </Text>
            )}

            {isEditMode &&
                (!onConvertToGroup ? (
                    <ActionIcon onClick={onDelete}>
                        <MantineIcon icon={IconX} size="lg" />
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
        </div>
    );
};

export default FilterRuleForm;
