import { isMomentInput, isWeekDay, WeekDay } from '@lightdash/common';
import { Text } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import moment from 'moment';
import { FC, useState } from 'react';

// from 0 (Monday) to 6 (Sunday) to 0 (Sunday) to 6 (Saturday)
type WeekDayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const convertWeekDayToDayPickerWeekDay = (
    weekDay: WeekDay,
): WeekDayIndex => {
    const converted = weekDay + 1;
    return (converted <= 6 ? converted : 0) as WeekDayIndex;
};

// from 0 (Monday) to 6 (Sunday) to 1 (Monday) to 7 (Sunday)
type WeekDayIndexMoment = 1 | 2 | 3 | 4 | 5 | 6 | 7;
const convertWeekDayToMomentWeekDay = (
    weekDay: WeekDay,
): WeekDayIndexMoment => {
    return (weekDay + 1) as WeekDayIndexMoment;
};

type WeekRange = { from: Date; to: Date };

function getWeekRange(date: Date, startOfWeek?: WeekDay | null): WeekRange {
    if (isWeekDay(startOfWeek)) {
        const convertedStartOfWeek = convertWeekDayToMomentWeekDay(startOfWeek);
        const valueWeekDay = moment(date).isoWeekday(); //  1 (Monday) to 7 (Sunday)
        let from = moment(date);
        if (valueWeekDay > convertedStartOfWeek) {
            from = moment(date).subtract(
                valueWeekDay - convertedStartOfWeek,
                'days',
            );
        } else if (convertedStartOfWeek > valueWeekDay) {
            from = moment(date).subtract(
                7 - convertedStartOfWeek + valueWeekDay,
                'days',
            );
        }
        return {
            from: from.toDate(),
            to: moment(from).add(6, 'day').toDate(),
        };
    }

    return {
        from: moment(date).startOf('week').toDate(),
        to: moment(date).endOf('week').toDate(),
    };
}

const isInWeekRange = (date: Date, value: Date | null): boolean => {
    if (!value) return false;
    const { from, to } = getWeekRange(date);
    return moment(value).isBetween(from, to, 'day', '[]');
};

type Props = {
    value: unknown;
    onChange: (value: Date) => void;
    // TODO: remove popoverProps
    // popoverProps?: Popover2Props;
    disabled?: boolean;
    startOfWeek?: WeekDay | null;
};

const WeekPicker: FC<Props> = ({
    value: dateValue,
    onChange,
    // TODO: remove popoverProps
    // popoverProps,
    disabled,
    startOfWeek,
}) => {
    const [hovered, setHovered] = useState<Date | null>(null);
    const value = isMomentInput(dateValue) ? moment(dateValue).toDate() : null;

    return (
        <>
            <Text color="gray">week commencing</Text>

            <DateInput
                sx={{ flex: 1 }}
                disabled={disabled}
                getDayProps={(date) => {
                    const isHovered = isInWeekRange(date, hovered);
                    const isSelected = isInWeekRange(date, value);
                    const isInRange = isHovered || isSelected;
                    const weekRange = getWeekRange(date, startOfWeek);

                    return {
                        onMouseEnter: () => setHovered(date),
                        onMouseLeave: () => setHovered(null),
                        inRange: isInRange,
                        firstInRange:
                            isInRange &&
                            date.getDate() === weekRange.from.getDate(),
                        lastInRange:
                            isInRange &&
                            date.getDate() === weekRange.to.getDate(),
                        selected: isSelected,
                    };
                }}
                value={value}
                onChange={(date) => {
                    if (!date) return;
                    console.log(getWeekRange(new Date(date), startOfWeek));
                    onChange(getWeekRange(new Date(date), startOfWeek).from);
                }}
                firstDayOfWeek={
                    isWeekDay(startOfWeek)
                        ? convertWeekDayToDayPickerWeekDay(startOfWeek)
                        : undefined
                }
            />
        </>
    );
};

export default WeekPicker;
