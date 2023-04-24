import { ConditionalRule, FilterOperator } from '@lightdash/common';
import { Select } from '@mantine/core';
import DefaultFilterInputs, { FilterInputsProps } from './DefaultFilterInputs';

// TODO: revisit types
const BooleanFilterInputs = <T extends ConditionalRule>(
    props: React.PropsWithChildren<FilterInputsProps<T>>,
) => {
    const { rule, onChange, disabled } = props;
    switch (rule.operator) {
        case FilterOperator.EQUALS: {
            return (
                <Select
                    disabled={disabled}
                    onChange={(value) =>
                        onChange({
                            ...rule,
                            values: [value === 'true'],
                        })
                    }
                    data={[
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
