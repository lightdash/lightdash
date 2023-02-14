import { FormGroup } from '@blueprintjs/core';
import { NumericInput as NumberInput } from '@blueprintjs/core/lib/esm/components/forms/numericInput';
import { TimePicker } from '@blueprintjs/datetime';
import React, { FC } from 'react';
import { getTimePickerValue, parseCronExpression } from './cronInputUtils';
import WeekDaySelect from './WeekDaySelect';

const MonthlyInputs: FC<{
    disabled?: boolean;
    cronExpression: string;
    onChange: (value: string) => void;
}> = ({ disabled, cronExpression, onChange }) => {
    const { minutes, hours, weekDay, day } =
        parseCronExpression(cronExpression);

    const onDayChange = (value: number) => {
        if (value >= 1 && value <= 31) {
            onChange([minutes, hours, `${value}`, '*', `*`].join(' '));
        }
    };

    const onTimeChange = (date: Date) => {
        onChange(
            [
                `${date.getMinutes()}`,
                `${date.getHours()}`,
                '*',
                '*',
                weekDay,
            ].join(' '),
        );
    };

    return (
        <>
            <FormGroup label={'on'} disabled={disabled}>
                <NumberInput
                    fill
                    value={day}
                    onValueChange={onDayChange}
                    disabled={disabled}
                    min={1}
                    max={31}
                />
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
export default MonthlyInputs;
