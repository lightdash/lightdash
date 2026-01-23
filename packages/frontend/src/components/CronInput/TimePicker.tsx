import { TimeInput } from '@mantine/dates';
import dayjs from 'dayjs';
import React, { type FC } from 'react';
import { parseCronExpression } from './cronInputUtils';

const getTimePickerValue = (hours: number, minutes: number) => {
    const date = new Date();
    date.setHours(hours);
    date.setMinutes(minutes);
    return dayjs(date).format('HH:mm');
};

const TimePicker: FC<{
    disabled?: boolean;
    cronExpression: string;
    onChange: (value: { hours: number; minutes: number }) => void;
}> = ({ disabled, cronExpression, onChange }) => {
    const { minutes, hours } = parseCronExpression(cronExpression);

    const handleChange = (timeString: string) => {
        const parts = timeString.split(':');
        const date = new Date();
        date.setHours(Number(parts[0]));
        date.setMinutes(Number(parts[1]));

        if (date && date.toString() !== 'Invalid Date') {
            onChange({ hours: date.getHours(), minutes: date.getMinutes() });
        }
    };

    return (
        <TimeInput
            w="7xl"
            disabled={disabled}
            value={getTimePickerValue(hours, minutes)}
            onChange={(val) => handleChange(val.target.value)}
        />
    );
};
export default TimePicker;
