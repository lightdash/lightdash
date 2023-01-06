import { HTMLSelect } from '@blueprintjs/core';
import { ConditionalRule, FilterOperator } from '@lightdash/common';
import DefaultFilterInputs, { FilterInputsProps } from './DefaultFilterInputs';

const BooleanFilterInputs = <T extends ConditionalRule>(
    props: React.PropsWithChildren<FilterInputsProps<T>>,
) => {
    const { rule, onChange, disabled } = props;
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
                    options={[
                        { value: 'true', label: 'True' },
                        { value: 'false', label: 'False' },
                    ]}
                    value={rule.values?.[0] ? 'true' : 'false'}
                />
            );
        }

        default: {
            return <DefaultFilterInputs {...props} />;
        }
    }
};

export default BooleanFilterInputs;
