import {
    MonthPicker,
    MonthPickerInput,
    type MonthPickerInputProps,
} from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';
import { type FC } from 'react';
import InvalidDateInput from './InvalidDateInput';

type Props = Omit<MonthPickerInputProps, 'value' | 'onChange'> & {
    value: Date | null;
    onChange: (value: Date) => void;
    invalidValue?: string;
};

const FilterMonthAndYearPicker: FC<Props> = ({
    value,
    onChange,
    invalidValue,
    ...props
}) => {
    const [isPopoverOpen, { open, close, toggle }] = useDisclosure();

    const yearValue = value ? dayjs(value).toDate() : null;
    const handleChange = (date: Date | null | Date[]) => {
        if (!date || Array.isArray(date)) return;
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
                    <MonthPicker
                        value={null}
                        minDate={dayjs().year(1000).toDate()}
                        maxDate={dayjs().year(9999).toDate()}
                        onChange={(date) => {
                            if (!date || Array.isArray(date)) return;
                            onChange(date);
                            closeInvalidInput();
                        }}
                    />
                )}
            </InvalidDateInput>
        );
    }

    return (
        <MonthPickerInput
            w="100%"
            size="xs"
            minDate={dayjs().year(1000).toDate()}
            maxDate={dayjs().year(9999).toDate()}
            onClick={toggle}
            {...props}
            popoverProps={{
                shadow: 'md',
                // Month and year picker does not manage its own state properly.
                // additional props are needed to make it work
                ...props.popoverProps,
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

export default FilterMonthAndYearPicker;
