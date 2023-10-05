import { Colors, HTMLSelect } from '@blueprintjs/core';
import {
    createFilterRuleFromField,
    fieldId as getFieldId,
    FilterableField,
    FilterRule,
    FilterType,
    getFilterRuleWithDefaultValue,
    getFilterTypeFromItem,
    isField,
} from '@lightdash/common';
import { ActionIcon, Box, Menu } from '@mantine/core';
import { IconDots, IconX } from '@tabler/icons-react';
import React, { FC, useCallback, useMemo } from 'react';
import MantineIcon from '../MantineIcon';
import { FilterTypeConfig } from './configs';
import FieldAutoComplete from './FieldAutocomplete/FieldAutoComplete';

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
                    <FieldAutoComplete
                        activeField={activeField}
                        fields={fields}
                        onChange={(field) => {
                            if (isField(field)) {
                                onFieldChange(getFieldId(field));
                            }
                        }}
                        disabled={!isEditMode}
                        hasGrouping
                    />
                    <HTMLSelect
                        className={!isEditMode ? 'disabled-filter' : ''}
                        fill={false}
                        disabled={!isEditMode}
                        style={{ width: 150 }}
                        onChange={(e) => {
                            onChange(
                                getFilterRuleWithDefaultValue(
                                    activeField,
                                    {
                                        ...filterRule,
                                        operator: e.currentTarget
                                            .value as FilterRule['operator'],
                                    },
                                    (filterRule.values?.length || 0) > 0
                                        ? filterRule.values
                                        : [1],
                                ),
                            );
                        }}
                        options={filterConfig.operatorOptions}
                        value={filterRule.operator}
                    />
                    <filterConfig.inputs
                        filterType={filterType}
                        field={activeField}
                        rule={filterRule}
                        onChange={onChange}
                        disabled={!isEditMode}
                    />
                </>
            ) : (
                <span style={{ width: '100%', color: Colors.GRAY1 }}>
                    Tried to reference field with unknown id:{' '}
                    {filterRule.target.fieldId}
                </span>
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
