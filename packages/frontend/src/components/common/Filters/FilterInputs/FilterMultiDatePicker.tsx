import { Pill, PillsInput, Popover } from '@mantine/core';
import { type DayOfWeek } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import {
    useCallback,
    useMemo,
    useState,
    type FC,
    type KeyboardEvent,
} from 'react';
import { type FilterPopoverProps } from '../context';
import FilterMultiDateCalendar from './FilterMultiDateCalendar';
import classes from './FilterMultiDatePicker.module.css';
import {
    formatTimeFrameLabel,
    normalizeTimeFrameValues,
    parseTypedTimeFrameValue,
    type MultiDateTimeFrame,
} from './FilterMultiDatePicker.utils';
import InvalidDateInput from './InvalidDateInput';

type Props = {
    timeFrame: MultiDateTimeFrame;
    values: Date[];
    onChange: (values: Date[]) => void;
    firstDayOfWeek: DayOfWeek;
    placeholder?: string;
    disabled?: boolean;
    invalidValue?: string;
    popoverProps?: FilterPopoverProps;
    'data-autofocus'?: boolean;
};

/**
 * Multi-value date picker for the "is" / "is not" operators, which match any of
 * the selected values. Values are toggled in the calendar of the field's grain —
 * days, weeks, months, quarters or years — or typed into the field.
 */
const FilterMultiDatePicker: FC<Props> = ({
    timeFrame,
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

    const selectedValues = useMemo(
        () => normalizeTimeFrameValues(values, timeFrame, firstDayOfWeek),
        [values, timeFrame, firstDayOfWeek],
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

    const handleChange = useCallback(
        (nextValues: Date[]) => {
            onChange(
                normalizeTimeFrameValues(nextValues, timeFrame, firstDayOfWeek),
            );
        },
        [onChange, timeFrame, firstDayOfWeek],
    );

    const handleRemove = useCallback(
        (valueToRemove: Date) => {
            handleChange(
                selectedValues.filter(
                    (value) => value.getTime() !== valueToRemove.getTime(),
                ),
            );
        },
        [handleChange, selectedValues],
    );

    const commitSearch = useCallback(() => {
        if (search.trim() === '') return;
        const parsed = parseTypedTimeFrameValue(search.trim(), timeFrame);
        setSearch('');
        if (!parsed) return;
        handleChange([...selectedValues, parsed]);
    }, [handleChange, selectedValues, search, timeFrame]);

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
                selectedValues.length > 0
            ) {
                event.preventDefault();
                handleRemove(selectedValues[selectedValues.length - 1]);
            }
        },
        [commitSearch, handleRemove, selectedValues, search],
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
                    <FilterMultiDateCalendar
                        timeFrame={timeFrame}
                        firstDayOfWeek={firstDayOfWeek}
                        values={[]}
                        onChange={(nextValues) => {
                            handleChange(nextValues);
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
                        {selectedValues.map((value) => {
                            const label = formatTimeFrameLabel(
                                value,
                                timeFrame,
                            );
                            return (
                                <Pill
                                    key={value.getTime()}
                                    withRemoveButton={!disabled}
                                    disabled={disabled}
                                    onRemove={() => handleRemove(value)}
                                    removeButtonProps={{
                                        'aria-label': `Remove ${label}`,
                                        'aria-hidden': false,
                                    }}
                                >
                                    {label}
                                </Pill>
                            );
                        })}
                        <PillsInput.Field
                            data-autofocus={dataAutofocus}
                            value={search}
                            disabled={disabled}
                            placeholder={
                                selectedValues.length > 0
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
                <FilterMultiDateCalendar
                    timeFrame={timeFrame}
                    firstDayOfWeek={firstDayOfWeek}
                    values={selectedValues}
                    onChange={handleChange}
                />
            </Popover.Dropdown>
        </Popover>
    );
};

export default FilterMultiDatePicker;
