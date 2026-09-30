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
    onInvalidChange?: (value: string) => void;
}

/**
 * Parses a text input into a number or null.
 * Returns null for empty strings or invalid formats.
 */
function parseNumberInput(
    text: string,
    allowNumberSyntax: boolean,
): number | null {
    if (text === '') return null;
    if (allowNumberSyntax) {
        const number = Number(text);
        return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) &&
            Number.isFinite(number)
            ? number
            : null;
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
    onInvalidChange,
    onBlur,
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

    const flushInput = useCallback(() => {
        const parsedNumber = parseNumberInput(inputText, !!onInvalidChange);
        if (onInvalidChange && inputText !== '' && parsedNumber === null) {
            if (inputText !== value) onInvalidChange(inputText);
        } else if (parsedNumber !== (value ?? null)) onChange(parsedNumber);
    }, [inputText, onChange, onInvalidChange, value]);

    useDebounce(
        () => {
            const isIntermediateState =
                inputText.endsWith('.') ||
                inputText === '-' ||
                inputText === '.';
            if (!isIntermediateState) flushInput();
        },
        300,
        [inputText, flushInput],
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
            type={onInvalidChange ? 'text' : 'number'}
            inputMode={onInvalidChange ? 'decimal' : undefined}
            value={inputText}
            onChange={handleInputChange}
            onBlur={(event) => {
                // Apply blurs the input before validating. Flush the pending
                // value now so it cannot validate the previous debounced value.
                flushInput();
                onBlur?.(event);
            }}
        />
    );
};

export default FilterNumberInput;
