import { FormGroup } from '@blueprintjs/core';
import { TimePicker } from '@blueprintjs/datetime';
import React, { FC } from 'react';
import {
    getTimePickerValue,
    getWeeklyCronExpression,
    parseCronExpression,
} from './cronInputUtils';
import WeekDaySelect from './WeekDaySelect';

const WeeklyInputs: FC<{
    disabled?: boolean;
    cronExpression: string;
    onChange: (value: string) => void;
}> = ({ disabled, cronExpression, onChange }) => {
    const { minutes, hours, weekDay } = parseCronExpression(cronExpression);

    const onDayChange = (weekday: number) => {
        onChange([minutes, hours, '*', '*', `${weekday}`].join(' '));
    };

    const onTimeChange = (date: Date) => {
        onChange(
            getWeeklyCronExpression(
                date.getMinutes(),
                date.getHours(),
                weekDay,
            ),
        );
    };

    return (
        <>
            <FormGroup label={'on'} disabled={disabled}>
                <WeekDaySelect value={weekDay} onChange={onDayChange} />
            </FormGroup>
            <FormGroup label={'at'} disabled={disabled}>
                <TimePicker
                    disabled={disabled}
                    value={getTimePickerValue(hours, minutes)}
                    onChange={onTimeChange}
                />
            </FormGroup>
        </>
    );
};
export default WeeklyInputs;
