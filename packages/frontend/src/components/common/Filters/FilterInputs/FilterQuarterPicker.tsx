import { formatDate, TimeFrames } from '@lightdash/common';
import { TextInput, Stack, Text, Popover } from '@mantine-8/core';
import { MonthPicker } from '@mantine-8/dates';
import { useDisclosure } from '@mantine-8/hooks';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import { useCallback, useEffect, useState, type FC } from 'react';
import { type FilterPopoverProps } from '../context';
import styles from './FilterQuarterPicker.module.css';
import { formatMantineDate, parseMantineDate } from './mantineDateAdapter';

dayjs.extend(quarterOfYear);

type Props = {
    value: Date | null;
    onChange: (value: Date) => void;
    placeholder?: string;
    disabled?: boolean;
    popoverProps?: FilterPopoverProps;
    autoFocus?: boolean;
    invalidValue?: string;
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
    autoFocus,
    invalidValue,
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

    const getStartOfQuarter = useCallback(
        (date: Date): Date => dayjs(date).startOf('quarter').toDate(),
        [],
    );

    const handleMonthSelect = useCallback(
        (mantineValue: string | null) => {
            const date = parseMantineDate(mantineValue);
            if (!date) return;

            const startOfQuarter = getStartOfQuarter(date);
            setSelectedYear(dayjs(startOfQuarter).year());
            onChange(startOfQuarter);
            close();
        },
        [close, onChange, getStartOfQuarter],
    );

    useEffect(() => {
        setSelectedYear(yearValue);
    }, [yearValue]);

    const getMonthControlProps = useCallback(
        (mantineValue: string) => {
            const date = parseMantineDate(mantineValue);
            if (!date) return {};

            const month = date.getMonth();
            const year = date.getFullYear();
            const isSelected =
                Boolean(parsedDate) &&
                year === yearValue &&
                getQuarterMonths(monthValue).includes(month);
            const isHovered =
                !isSelected &&
                hoveredMonth !== null &&
                getQuarterMonths(hoveredMonth).includes(month);

            return {
                className: styles.monthControl,
                'data-quarter-selected': isSelected || undefined,
                'data-quarter-hovered': isHovered || undefined,
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
                    data-autofocus={autoFocus || undefined}
                    onClick={disabled ? undefined : open}
                    placeholder={placeholder}
                    value={
                        invalidValue ??
                        (value
                            ? formatDate(value, TimeFrames.QUARTER)
                            : undefined)
                    }
                    error={invalidValue ? 'Invalid date' : undefined}
                    readOnly
                    styles={{
                        input: {
                            cursor: 'pointer',
                        },
                    }}
                />
            </Popover.Target>
            <Popover.Dropdown>
                <Stack gap="xs">
                    <MonthPicker
                        date={
                            formatMantineDate(new Date(selectedYear, 0)) ??
                            undefined
                        }
                        onDateChange={(mantineValue) => {
                            const date = parseMantineDate(mantineValue);
                            if (date) setSelectedYear(date.getFullYear());
                        }}
                        value={null}
                        onChange={handleMonthSelect}
                        getMonthControlProps={getMonthControlProps}
                        onMouseLeave={() => setHoveredMonth(null)}
                    />
                    {hoveredMonth !== null && (
                        <Text size="xs" ta="center">
                            {selectedYear}-Q{getQuarterFromMonth(hoveredMonth)}
                        </Text>
                    )}
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

export default FilterQuarterPicker;
