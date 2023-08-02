import { HTMLSelect } from '@blueprintjs/core';
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
                    options={[
                        { value: 'any', label: placeholder, disabled: true },
                        { value: 'true', label: 'True' },
                        { value: 'false', label: 'False' },
                    ]}
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
