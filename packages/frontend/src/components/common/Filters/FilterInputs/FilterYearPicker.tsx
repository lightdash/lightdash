import {
    YearPicker,
    YearPickerInput,
    type YearPickerInputProps,
} from '@mantine-8/dates';
import { useDisclosure } from '@mantine-8/hooks';
import { type FC } from 'react';
import InvalidDateInput from './InvalidDateInput';
import { formatMantineDate, parseMantineDate } from './mantineDateAdapter';

type Props = Omit<
    YearPickerInputProps,
    'value' | 'defaultValue' | 'onChange' | 'minDate' | 'maxDate'
> & {
    value: Date | null;
    onChange: (value: Date) => void;
    invalidValue?: string;
};
const FilterYearPicker: FC<Props> = ({
    value,
    onChange,
    invalidValue,
    ...props
}) => {
    const [isPopoverOpen, { open, close, toggle }] = useDisclosure();

    const yearValue = formatMantineDate(value);
    const handleChange = (mantineValue: unknown) => {
        if (typeof mantineValue !== 'string') return;
        const date = parseMantineDate(mantineValue);
        if (!date) return;
        onChange(date);
        close();
    };

    if (invalidValue) {
        return (
            <InvalidDateInput
                value={invalidValue}
                disabled={props.disabled}
                popoverProps={props.popoverProps}
                autoFocus={props.autoFocus}
            >
                {({ close: closeInvalidInput }) => (
                    <YearPicker
                        value={null}
                        minDate="1000-01-01"
                        maxDate="9999-12-31"
                        onChange={(date) => {
                            const parsedDate = parseMantineDate(date);
                            if (!parsedDate) return;
                            onChange(parsedDate);
                            closeInvalidInput();
                        }}
                    />
                )}
            </InvalidDateInput>
        );
    }

    return (
        <YearPickerInput
            w="100%"
            size="xs"
            minDate="1000-01-01"
            maxDate="9999-12-31"
            onClick={toggle}
            {...props}
            popoverProps={{
                shadow: 'md',
                ...props.popoverProps,
                // Month and year picker does not manage its own state properly.
                // additional props are needed to make it work
                opened: isPopoverOpen,
                onOpen: () => {
                    props.popoverProps?.onOpen?.();
                    open();
                },
                onClose: () => {
                    props.popoverProps?.onClose?.();
                    close();
                },
            }}
            value={yearValue}
            onChange={handleChange}
        />
    );
};

export default FilterYearPicker;
