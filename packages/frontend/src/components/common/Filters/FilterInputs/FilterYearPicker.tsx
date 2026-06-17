import {
    YearPicker,
    YearPickerInput,
    type YearPickerInputProps,
} from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';
import { type FC } from 'react';
import InvalidDateInput from './InvalidDateInput';

type Props = Omit<YearPickerInputProps, 'value' | 'onChange'> & {
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
                    <YearPicker
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
        <YearPickerInput
            w="100%"
            size="xs"
            minDate={dayjs().year(1000).toDate()}
            maxDate={dayjs().year(9999).toDate()}
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
