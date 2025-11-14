import { TextInput, type TextInputProps } from '@mantine/core';
import {
    useCallback,
    useEffect,
    useState,
    type ChangeEvent,
    type FC,
} from 'react';
import { useDebounce } from 'react-use';

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

    useDebounce(
        () => {
            if (internalValue === '') {
                onChange(null);
            } else if (/^-?\d+$/.test(internalValue)) {
                onChange(parseInt(internalValue, 10));
            } else if (/^-?\d+\.\d+$/.test(internalValue)) {
                onChange(parseFloat(internalValue));
            }
        },
        300,
        [internalValue],
    );

    const handleInputChange = useCallback(
        (e: ChangeEvent<HTMLInputElement>) => {
            const newValue = e.target.value;

            setInternalValue(newValue);
        },
        [],
    );

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
