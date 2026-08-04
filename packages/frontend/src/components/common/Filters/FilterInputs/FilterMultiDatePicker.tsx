import { TimeFrames } from '@lightdash/common';
import { Pill, PillsInput, Popover } from '@mantine-8/core';
import { DatePicker, type DayOfWeek } from '@mantine-8/dates';
import { useDisclosure } from '@mantine-8/hooks';
import {
    useCallback,
    useMemo,
    useState,
    type FC,
    type KeyboardEvent,
} from 'react';
import { type FilterPopoverProps } from '../context';
import { parseFilterDateValue } from './DateFilterInputs.utils';
import classes from './FilterMultiDatePicker.module.css';
import InvalidDateInput from './InvalidDateInput';
import { formatMantineDate, parseMantineDate } from './mantineDateAdapter';

type Props = {
    values: Date[];
    onChange: (values: Date[]) => void;
    firstDayOfWeek: DayOfWeek;
    placeholder?: string;
    disabled?: boolean;
    invalidValue?: string;
    popoverProps?: FilterPopoverProps;
    'data-autofocus'?: boolean;
};

const sortAscending = (dates: Date[]): Date[] =>
    [...dates].sort((a, b) => a.getTime() - b.getTime());

/**
 * Multi-value date picker for the "is" / "is not" operators, which match any of
 * the selected dates. Dates can be toggled in the calendar or typed into the
 * field.
 */
const FilterMultiDatePicker: FC<Props> = ({
    values,
    onChange,
    firstDayOfWeek,
    placeholder,
    disabled,
    invalidValue,
    popoverProps,
    'data-autofocus': dataAutofocus,
}) => {
    const [opened, { open, close }] = useDisclosure(false);
    const [search, setSearch] = useState('');

    const mantineValues = useMemo(
        () =>
            values
                .map(formatMantineDate)
                .filter((value): value is string => value !== null),
        [values],
    );

    const openPopover = useCallback(() => {
        if (disabled || opened) return;
        popoverProps?.onOpen?.();
        open();
    }, [disabled, opened, open, popoverProps]);

    const closePopover = useCallback(() => {
        popoverProps?.onClose?.();
        close();
    }, [close, popoverProps]);

    const handleCalendarChange = useCallback(
        (nextValues: string[]) => {
            onChange(
                sortAscending(
                    nextValues
                        .map(parseMantineDate)
                        .filter((date): date is Date => date !== null),
                ),
            );
        },
        [onChange],
    );

    const handleRemove = useCallback(
        (valueToRemove: string) => {
            handleCalendarChange(
                mantineValues.filter((value) => value !== valueToRemove),
            );
        },
        [handleCalendarChange, mantineValues],
    );

    const commitSearch = useCallback(() => {
        if (search.trim() === '') return;
        const parsed = parseFilterDateValue(search.trim(), TimeFrames.DAY);
        setSearch('');
        const formatted = parsed && formatMantineDate(parsed);
        if (!formatted || mantineValues.includes(formatted)) return;
        handleCalendarChange([...mantineValues, formatted]);
    }, [handleCalendarChange, mantineValues, search]);

    const handleKeyDown = useCallback(
        (event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                commitSearch();
                return;
            }
            if (
                event.key === 'Backspace' &&
                search === '' &&
                mantineValues.length > 0
            ) {
                event.preventDefault();
                handleRemove(mantineValues[mantineValues.length - 1]);
            }
        },
        [commitSearch, handleRemove, mantineValues, search],
    );

    // A value we cannot parse means the rule holds something that is not a date
    // (e.g. hand-authored YAML) — surface it instead of silently dropping it.
    if (invalidValue) {
        return (
            <InvalidDateInput
                value={invalidValue}
                disabled={disabled}
                popoverProps={popoverProps}
                autoFocus={dataAutofocus}
            >
                {({ close: closeInvalid }) => (
                    <DatePicker
                        type="multiple"
                        firstDayOfWeek={firstDayOfWeek}
                        value={[]}
                        onChange={(nextValues) => {
                            handleCalendarChange(nextValues);
                            closeInvalid();
                        }}
                    />
                )}
            </InvalidDateInput>
        );
    }

    return (
        <Popover
            shadow="sm"
            withinPortal
            {...popoverProps}
            opened={opened}
            onClose={closePopover}
        >
            <Popover.Target>
                <PillsInput
                    w="100%"
                    size="xs"
                    disabled={disabled}
                    classNames={{ input: classes.pillsInput }}
                    onClick={openPopover}
                >
                    <Pill.Group>
                        {mantineValues.map((value) => (
                            <Pill
                                key={value}
                                withRemoveButton={!disabled}
                                disabled={disabled}
                                onRemove={() => handleRemove(value)}
                                removeButtonProps={{
                                    'aria-label': `Remove ${value}`,
                                    'aria-hidden': false,
                                }}
                            >
                                {value}
                            </Pill>
                        ))}
                        <PillsInput.Field
                            data-autofocus={dataAutofocus}
                            value={search}
                            disabled={disabled}
                            placeholder={
                                mantineValues.length > 0
                                    ? undefined
                                    : placeholder
                            }
                            onChange={(event) =>
                                setSearch(event.currentTarget.value)
                            }
                            onFocus={openPopover}
                            onBlur={commitSearch}
                            onKeyDown={handleKeyDown}
                        />
                    </Pill.Group>
                </PillsInput>
            </Popover.Target>
            <Popover.Dropdown>
                <DatePicker
                    type="multiple"
                    firstDayOfWeek={firstDayOfWeek}
                    // open on the earliest selected date rather than today
                    defaultDate={mantineValues[0]}
                    value={mantineValues}
                    onChange={handleCalendarChange}
                />
            </Popover.Dropdown>
        </Popover>
    );
};

export default FilterMultiDatePicker;
