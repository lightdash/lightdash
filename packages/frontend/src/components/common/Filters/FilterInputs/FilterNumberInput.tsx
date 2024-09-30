import { TextInput, type TextInputProps } from '@mantine/core';
import { useEffect, useState, type ChangeEvent, type FC } from 'react';

interface Props extends Omit<TextInputProps, 'type' | 'value' | 'onChange'> {
    value: unknown;
    onChange: (value: number | null) => void;
}

// FIXME: remove this and use NumberInput from @mantine/core once we upgrade to mantine v7
const FilterNumberInput: FC<Props> = ({
    value,
    disabled,
    placeholder,
    onChange,
    ...rest
}) => {
    const [internalValue, setInternalValue] = useState('');

    useEffect(() => {
        if (typeof value === 'string') {
            setInternalValue(value);
        } else if (typeof value === 'number') {
            setInternalValue(value.toString());
        } else if (value === undefined || value === null) {
            setInternalValue('');
        } else {
            throw new Error(
                `FilterNumberInput: Invalid value type: ${typeof value}`,
            );
        }
    }, [value]);

    const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;

        setInternalValue(newValue);

        if (newValue === '') {
            onChange(null);
        } else if (/^-?\d+$/.test(newValue)) {
            onChange(parseInt(newValue, 10));
        } else if (/^-?\d+\.\d+$/.test(newValue)) {
            onChange(parseFloat(newValue));
        }
    };

    return (
        <TextInput
            w="100%"
            size="xs"
            disabled={disabled}
            placeholder={placeholder}
            {...rest}
            type="number"
            value={internalValue}
            onChange={handleInputChange}
        />
    );
};

export default FilterNumberInput;
