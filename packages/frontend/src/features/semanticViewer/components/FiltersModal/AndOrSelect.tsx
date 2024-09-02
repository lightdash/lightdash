import { Select, type SelectProps } from '@mantine/core';
import { type FC } from 'react';

export enum AndOr {
    AND = 'and',
    OR = 'or',
}

type AndOrSelectProps = Omit<SelectProps, 'value' | 'onChange' | 'data'> & {
    value: AndOr;
    onChange: (value: AndOr) => void;
};

const AndOrSelect: FC<AndOrSelectProps> = ({ value, onChange, ...props }) => {
    return (
        <Select
            withinPortal
            value={value}
            onChange={onChange}
            data={[
                { value: AndOr.AND, label: 'And' },
                { value: AndOr.OR, label: 'Or' },
            ]}
            {...props}
        />
    );
};

export default AndOrSelect;
