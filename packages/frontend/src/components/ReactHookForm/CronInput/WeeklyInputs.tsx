import { Classes, FormGroup } from '@blueprintjs/core';
import { TimePicker } from '@blueprintjs/datetime';
import React, { FC } from 'react';
import { InlinedInputs, InlinedLabel } from './CronInput.styles';
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

    const onDayChange = (newWeekday: number) => {
        onChange(getWeeklyCronExpression(minutes, hours, newWeekday));
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
        <InlinedInputs>
            <FormGroup inline label={'on'} disabled={disabled}>
                <WeekDaySelect value={weekDay} onChange={onDayChange} />
            </FormGroup>
            <FormGroup inline label={'at'} disabled={disabled}>
                <TimePicker
                    useAmPm
                    disabled={disabled}
                    value={getTimePickerValue(hours, minutes)}
                    onChange={onTimeChange}
                />
            </FormGroup>
            <InlinedLabel className={Classes.LABEL}>UTC</InlinedLabel>
        </InlinedInputs>
    );
};
export default WeeklyInputs;
