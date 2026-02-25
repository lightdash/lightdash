import {
    FilterOperator,
    isFilterRule,
    type BaseFilterRule,
} from '@lightdash/common';
import { Select } from '@mantine/core';
import { type FilterInputsProps } from '.';
import { getPlaceholderByFilterTypeAndOperator } from '../utils/getPlaceholderByFilterTypeAndOperator';
import DefaultFilterInputs from './DefaultFilterInputs';

const BooleanFilterInputs = <T extends BaseFilterRule>(
    props: FilterInputsProps<T>,
) => {
    const { rule, onChange, disabled, filterType, popoverProps } = props;

    const isFilterRuleDisabled = isFilterRule(rule) && rule.disabled;

    const placeholder = getPlaceholderByFilterTypeAndOperator({
        type: filterType,
        operator: rule.operator,
        disabled: isFilterRuleDisabled,
    });

    switch (rule.operator) {
        case FilterOperator.EQUALS:
        case FilterOperator.NOT_EQUALS:
            const currentValue = rule.values?.[0]?.toString() ?? null;

            return (
                <Select
                    w="100%"
                    size="xs"
                    withinPortal={popoverProps?.withinPortal}
                    onDropdownOpen={popoverProps?.onOpen}
                    onDropdownClose={popoverProps?.onClose}
                    disabled={disabled}
                    autoFocus={true}
                    initiallyOpened={currentValue === null && !disabled}
                    placeholder={placeholder}
                    data={[
                        { value: 'true', label: 'True' },
                        { value: 'false', label: 'False' },
                    ]}
                    value={currentValue}
                    onChange={(value) =>
                        onChange({
                            ...rule,
                            values: value === null ? [] : [value === 'true'],
                        })
                    }
                />
            );

        default:
            return <DefaultFilterInputs {...props} />;
    }
};

export default BooleanFilterInputs;
