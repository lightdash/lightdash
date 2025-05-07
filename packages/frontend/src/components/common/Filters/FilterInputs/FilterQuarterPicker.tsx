import { TimeFrames, formatDate } from '@lightdash/common';
import {
    type MantineTheme,
    Popover,
    Stack,
    type Sx,
    Text,
    TextInput,
} from '@mantine/core';
import { MonthPicker, type MonthPickerProps } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import { type FC, useCallback, useState } from 'react';

dayjs.extend(quarterOfYear);

type Props = Pick<MonthPickerProps, 'value' | 'onChange'> & {
    placeholder?: string;
    disabled?: boolean;
    popoverProps?: any;
    autoFocus?: boolean;
};

const QUARTERS = [
    { value: '1', months: [0, 1, 2], label: 'Q1', range: 'Jan - Mar' },
    { value: '2', months: [3, 4, 5], label: 'Q2', range: 'Apr - Jun' },
    { value: '3', months: [6, 7, 8], label: 'Q3', range: 'Jul - Sep' },
    { value: '4', months: [9, 10, 11], label: 'Q4', range: 'Oct - Dec' },
];

const FilterQuarterPicker: FC<Props> = ({
    value,
    onChange,
    placeholder = 'Select Quarter',
    disabled,
    popoverProps,
}) => {
    const [opened, { open, close }] = useDisclosure(false);

    // Parse date value - it may be an ISO string like "2025-01-01T00:00:00.000Z"
    const parsedDate = value ? dayjs(value) : null;
    const yearValue = parsedDate ? parsedDate.year() : new Date().getFullYear();

    // Determine the quarter based on the month of the date
    const monthValue = parsedDate ? parsedDate.month() : 0;
    const getQuarterFromMonth = useCallback((month: number): string => {
        const quarter = QUARTERS.find((q) => q.months.includes(month));
        return quarter ? quarter.value : '1';
    }, []);

    const [selectedYear, setSelectedYear] = useState<number>(yearValue);
    const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

    // Get quarter's first and last month based on a month
    const getQuarterMonths = (month: number): number[] => {
        const quarter = QUARTERS.find((q) => q.months.includes(month));
        return quarter ? quarter.months : [0, 1, 2];
    };

    const handleMonthSelect = (date: Date | null) => {
        if (!date) return;

        // Use dayjs for date handling
        const dateObj = dayjs(date);
        const year = dateObj.year();
        setSelectedYear(year);

        const quarterDate = dateObj.startOf('quarter');

        onChange?.(quarterDate.toDate());
        close();
    };

    const getMonthControlProps = useCallback(
        (
            date: Date,
        ): {
            sx?: Sx;
            onMouseEnter: () => void;
            onMouseLeave?: () => void;
        } => {
            const month = date.getMonth();
            const year = date.getFullYear();

            // If this is the selected quarter's months, highlight them
            if (
                parsedDate &&
                year === yearValue &&
                getQuarterMonths(monthValue).includes(month)
            ) {
                return {
                    sx: (theme: MantineTheme) => ({
                        backgroundColor: theme.colors.blue[2],
                        '&:hover': {
                            backgroundColor: theme.colors.blue[2],
                        },
                    }),
                    onMouseEnter: () => setHoveredMonth(month),
                };
            }

            // If this is the hovered month's quarter, highlight all months in quarter
            if (
                hoveredMonth !== null &&
                getQuarterMonths(hoveredMonth).includes(month)
            ) {
                return {
                    sx: (theme: MantineTheme) => ({
                        backgroundColor: theme.colors.blue[1],
                        '&:hover': {
                            backgroundColor: theme.colors.blue[1],
                        },
                    }),
                    onMouseEnter: () => setHoveredMonth(month),
                };
            }

            return {
                onMouseEnter: () => setHoveredMonth(month),
                onMouseLeave: () => setHoveredMonth(null),
            };
        },
        [hoveredMonth, monthValue, parsedDate, yearValue],
    );

    return (
        <Popover
            opened={opened}
            onClose={close}
            position="bottom"
            shadow="md"
            withinPortal
            {...popoverProps}
        >
            <Popover.Target>
                <TextInput
                    size="xs"
                    onClick={disabled ? undefined : open}
                    placeholder={placeholder}
                    value={
                        value
                            ? formatDate(value, TimeFrames.QUARTER)
                            : undefined
                    }
                    readOnly
                    styles={{
                        input: {
                            cursor: 'pointer',
                        },
                    }}
                />
            </Popover.Target>
            <Popover.Dropdown>
                <Stack spacing="xs">
                    <MonthPicker
                        defaultDate={new Date(selectedYear, 0)}
                        value={null}
                        onChange={handleMonthSelect}
                        getMonthControlProps={getMonthControlProps}
                        onMouseLeave={() => setHoveredMonth(null)}
                    />
                    {hoveredMonth !== null && (
                        <Text size="xs" align="center">
                            {selectedYear}-Q{getQuarterFromMonth(hoveredMonth)}
                        </Text>
                    )}
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

export default FilterQuarterPicker;
