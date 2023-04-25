import {
    createFilterRuleFromField,
    fieldId as getFieldId,
    FilterableField,
    FilterOperator,
    FilterRule,
    FilterType,
    getFilterRuleWithDefaultValue,
    getFilterTypeFromItem,
    isField,
} from '@lightdash/common';
import { ActionIcon, Flex, Select, Text } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { FC, useCallback, useMemo } from 'react';
import MantineIcon from '../MantineIcon';
import { FilterTypeConfig } from './configs';
import FieldAutoComplete from './FieldAutoComplete';

type Props = {
    fields: FilterableField[];
    filterRule: FilterRule;
    isEditMode: boolean;
    onChange: (value: FilterRule) => void;
    onDelete: () => void;
};

const FilterRuleForm: FC<Props> = ({
    fields,
    filterRule,
    isEditMode,
    onChange,
    onDelete,
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
        <Flex gap="md">
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
                    />

                    <Select
                        disabled={!isEditMode}
                        // TODO: revisit this
                        sx={{ width: 150 }}
                        data={filterConfig.operatorOptions}
                        value={filterRule.operator}
                        onChange={(value: FilterOperator) => {
                            onChange(
                                getFilterRuleWithDefaultValue(
                                    activeField,
                                    {
                                        ...filterRule,
                                        operator: value,
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
                    />
                </>
            ) : (
                <Text color="gray">
                    Tried to reference field with unknown id:{' '}
                    {filterRule.target.fieldId}
                </Text>
            )}

            {isEditMode && (
                <ActionIcon
                    size="lg"
                    variant="light"
                    color="gray"
                    onClick={onDelete}
                >
                    <MantineIcon size="md" icon={IconX} />
                </ActionIcon>
            )}
        </Flex>
    );
};

export default FilterRuleForm;
