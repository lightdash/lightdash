import { HTMLSelect } from '@blueprintjs/core';
import { FilterOperator } from '@lightdash/common';
import { FC } from 'react';
import DefaultFilterInputs, { FilterInputsProps } from './DefaultFilterInputs';

const BooleanFilterInputs: FC<FilterInputsProps> = (props) => {
    const { filterRule, onChange } = props;
    switch (filterRule.operator) {
        case FilterOperator.EQUALS: {
            return (
                <HTMLSelect
                    fill
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
