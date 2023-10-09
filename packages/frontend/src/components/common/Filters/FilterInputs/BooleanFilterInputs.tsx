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

    switch (rule.operator) {
        case FilterOperator.EQUALS: {
            return (
                <Select
                    w="100%"
                    size="xs"
                    withinPortal
                    disabled={disabled}
                    placeholder={placeholder}
                    data={[
                        { value: 'true', label: 'True' },
                        { value: 'false', label: 'False' },
                    ]}
                    value={rule.values?.[0]?.toString() ?? null}
                    onChange={(value) =>
                        onChange({
                            ...rule,
                            values: value === null ? [] : [value === 'true'],
                        })
                    }
                />
            );
        }

        default: {
            return <DefaultFilterInputs {...props} />;
        }
    }
};

export default BooleanFilterInputs;
