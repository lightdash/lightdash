import { HTMLSelect, OptionProps } from '@blueprintjs/core';
import {
    ConditionalRule,
    FilterOperator,
    isFilterRule,
} from '@lightdash/common';
import { getPlaceholderByFilterTypeAndOperator } from '../utils/getPlaceholderByFilterTypeAndOperator';
import DefaultFilterInputs, { FilterInputsProps } from './DefaultFilterInputs';

const BooleanFilterInputs = <T extends ConditionalRule>(
    props: React.PropsWithChildren<FilterInputsProps<T>>,
) => {
    const { rule, onChange, disabled, filterType } = props;

    const placeholder = getPlaceholderByFilterTypeAndOperator({
        type: filterType,
        operator: rule.operator,
        disabled: isFilterRule(rule) ? rule.disabled : false,
    });

    const selectValue =
        rule.values === undefined ? 'any' : rule.values[0] ? 'true' : 'false';

    switch (rule.operator) {
        case FilterOperator.EQUALS: {
            return (
                <HTMLSelect
                    fill
                    className={disabled ? 'disabled-filter' : ''}
                    disabled={disabled}
                    onChange={(e) =>
                        onChange({
                            ...rule,
                            values: [e.currentTarget.value === 'true'],
                        })
                    }
                    placeholder={placeholder}
                    options={
                        [
                            {
                                value: 'any',
                                label: placeholder,
                                disabled: true,
                                hidden: true,
                            },
                            { value: 'true', label: 'True' },
                            { value: 'false', label: 'False' },
                            // adding explicit type conversion because `hidden` is not in the typings but it actually works
                        ] as OptionProps[]
                    }
                    value={selectValue}
                />
            );
        }

        default: {
            return <DefaultFilterInputs {...props} />;
        }
    }
};

export default BooleanFilterInputs;
