import { HTMLSelect } from '@blueprintjs/core';
import { FilterOperator, FilterRule } from '@lightdash/common';
import DefaultFilterInputs, { FilterInputsProps } from './DefaultFilterInputs';

const BooleanFilterInputs = <T extends FilterRule = FilterRule>(
    props: React.PropsWithChildren<FilterInputsProps<T>>,
) => {
    const { filterRule, onChange, disabled } = props;
    switch (filterRule.operator) {
        case FilterOperator.EQUALS: {
            return (
                <HTMLSelect
                    fill
                    className={disabled ? 'disabled-filter' : ''}
                    disabled={disabled}
                    onChange={(e) =>
                        onChange({
                            ...filterRule,
                            values: [e.currentTarget.value === 'true'],
                        })
                    }
                    options={[
                        { value: 'true', label: 'True' },
                        { value: 'false', label: 'False' },
                    ]}
                    value={filterRule.values?.[0] ? 'true' : 'false'}
                />
            );
        }

        default: {
            return <DefaultFilterInputs {...props} />;
        }
    }
};

export default BooleanFilterInputs;
