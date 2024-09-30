import { YearPickerInput, type YearPickerInputProps } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';
import { type FC } from 'react';

type Props = Omit<YearPickerInputProps, 'value' | 'onChange'> & {
    value: Date | null;
    onChange: (value: Date) => void;
};
const FilterYearPicker: FC<Props> = ({ value, onChange, ...props }) => {
    const [isPopoverOpen, { open, close, toggle }] = useDisclosure();

    const yearValue = value ? dayjs(value).toDate() : null;

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
            onChange={(date) => {
                if (!date || Array.isArray(date)) return;
                onChange(date);
                close();
            }}
        />
    );
};

export default FilterYearPicker;
