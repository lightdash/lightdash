import {
    ConditionalRule,
    FilterOperator,
    isFilterRule,
} from '@lightdash/common';
import { Select } from '@mantine/core';
import { getPlaceholderByFilterTypeAndOperator } from '../utils/getPlaceholderByFilterTypeAndOperator';
import DefaultFilterInputs, { FilterInputsProps } from './DefaultFilterInputs';

const BooleanFilterInputs = <T extends ConditionalRule>(
    props: React.PropsWithChildren<FilterInputsProps<T>>,
) => {
    const { rule, onChange, disabled, filterType } = props;

    const isFilterRuleDisabled = isFilterRule(rule) && rule.disabled;

    const placeholder = getPlaceholderByFilterTypeAndOperator({
        type: filterType,
        operator: rule.operator,
        disabled: isFilterRuleDisabled,
    });

    let selectValue;
    if (isFilterRuleDisabled || (rule.values && rule.values.length < 1)) {
        selectValue = 'any';
    } else {
        selectValue = rule.values?.[0] ? 'true' : 'false';
    }

    switch (rule.operator) {
        case FilterOperator.EQUALS: {
            return (
                <Select
                    className={disabled ? 'disabled-filter' : ''}
                    disabled={disabled}
                    data={[
                        {
                            value: 'any',
                            label: placeholder,
                            disabled: true,
                            hidden: true,
                        },
                        { value: 'true', label: 'True' },
                        { value: 'false', label: 'False' },
                        // adding explicit type conversion because `hidden` is not in the typings but it actually works
                    ]}
                    value={selectValue}
                    onChange={(value) =>
                        onChange({
                            ...rule,
                            values: [value === 'true'],
                        })
                    }
                    placeholder={placeholder}
                />
            );
        }

        default: {
            return <DefaultFilterInputs {...props} />;
        }
    }
};

export default BooleanFilterInputs;
