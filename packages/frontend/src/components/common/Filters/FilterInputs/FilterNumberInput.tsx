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

/**
 * Parses a text input into a number or null.
 * Returns null for empty strings or invalid formats.
 */
function parseNumberInput(text: string): number | null {
    if (text === '') {
        return null;
    }
    if (/^-?\d+$/.test(text)) {
        return parseInt(text, 10);
    }
    if (/^-?\d+\.\d+$/.test(text)) {
        return parseFloat(text);
    }
    return null;
}

/**
 * Number input with debounced onChange to prevent excessive parent updates.
 *
 * Flow:
 * 1. Parent's `value` prop syncs to internal `inputText` state (one-way)
 * 2. User types → updates `inputText` immediately (for responsive UI)
 * 3. After 300ms of no typing → parse text → call `onChange` if value changed
 *
 * FIXME: remove this and use NumberInput from @mantine/core once we upgrade to mantine v7
 */
const FilterNumberInput: FC<Props> = ({
    value,
    disabled,
    placeholder,
    onChange,
    ...rest
}) => {
    // The text currently displayed in the input field
    const [inputText, setInputText] = useState('');

    // Sync parent's value prop to our input text
    useEffect(() => {
        if (typeof value === 'string') {
            setInputText(value);
        } else if (typeof value === 'number') {
            setInputText(value.toString());
        } else if (value === undefined || value === null) {
            setInputText('');
        } else {
            throw new Error(
                `FilterNumberInput: Invalid value type: ${typeof value}`,
            );
        }
    }, [value]);

    // Parse input text and notify parent if value actually changed
    useDebounce(
        () => {
            const parsedNumber = parseNumberInput(inputText);
            const normalizedPropValue = value ?? null;

            const isIntermediateState =
                inputText.endsWith('.') ||
                inputText === '-' ||
                inputText === '.';

            // Only notify parent if the parsed value differs from current prop
            // This prevents infinite loops from unnecessary onChange calls
            if (!isIntermediateState && parsedNumber !== normalizedPropValue) {
                onChange(parsedNumber);
            }
        },
        300,
        [inputText, value, onChange],
    );

    const handleInputChange = useCallback(
        (e: ChangeEvent<HTMLInputElement>) => {
            const inputValue = e.target.value;
            setInputText(inputValue);
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
            value={inputText}
            onChange={handleInputChange}
        />
    );
};

export default FilterNumberInput;
