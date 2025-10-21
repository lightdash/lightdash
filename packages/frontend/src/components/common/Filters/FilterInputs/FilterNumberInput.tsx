import { TextInput, type TextInputProps } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
    type FC,
} from 'react';

interface Props extends Omit<TextInputProps, 'type' | 'value' | 'onChange'> {
    value: unknown;
    onChange: (value: number | null) => void;
}

const parseValue = (value: unknown) => {
    if (typeof value === 'string') {
        return value;
    } else if (typeof value === 'number') {
        return value.toString();
    } else if (value === undefined || value === null) {
        return '';
    } else {
        throw new Error(
            `FilterNumberInput: Invalid value type: ${typeof value}`,
        );
    }
};

// FIXME: remove this and use NumberInput from @mantine/core once we upgrade to mantine v7
const FilterNumberInput: FC<Props> = ({
    value,
    disabled,
    placeholder,
    onChange,
    ...rest
}) => {
    const parsedValue = useMemo(() => parseValue(value), [value]);
    const [internalValue, setInternalValue] = useState(parsedValue);
    const [debouncedValue] = useDebouncedValue(internalValue, 300);
    const onChangeRef = useRef(onChange);

    // Keep the ref updated with the latest onChange callback
    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
        setInternalValue((prev) => {
            if (prev !== parsedValue) {
                return parsedValue;
            }
            return prev;
        });
    }, [parsedValue]);

    const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setInternalValue(newValue);
    };

    useEffect(() => {
        if (debouncedValue === '') {
            onChangeRef.current(null);
        } else if (/^-?\d+$/.test(debouncedValue)) {
            onChangeRef.current(parseInt(debouncedValue, 10));
        } else if (/^-?\d+\.\d+$/.test(debouncedValue)) {
            onChangeRef.current(parseFloat(debouncedValue));
        }
    }, [debouncedValue]);

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
