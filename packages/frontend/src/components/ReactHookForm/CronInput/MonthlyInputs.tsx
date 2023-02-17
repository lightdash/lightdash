import { Classes, FormGroup } from '@blueprintjs/core';
import { TimePicker } from '@blueprintjs/datetime';
import React, { FC } from 'react';
import { DaysInput, InlinedInputs, InlinedLabel } from './CronInput.styles';
import {
    getMonthlyCronExpression,
    getTimePickerValue,
    parseCronExpression,
} from './cronInputUtils';

const MonthlyInputs: FC<{
    disabled?: boolean;
    cronExpression: string;
    onChange: (value: string) => void;
}> = ({ disabled, cronExpression, onChange }) => {
    const { minutes, hours, day } = parseCronExpression(cronExpression);

    const onDayChange = (newDay: number) => {
        if (newDay >= 1 && newDay <= 31) {
            onChange(getMonthlyCronExpression(minutes, hours, newDay));
        }
    };

    const onTimeChange = (date: Date) => {
        onChange(
            getMonthlyCronExpression(date.getMinutes(), date.getHours(), day),
        );
    };

    return (
        <InlinedInputs>
            <FormGroup inline label={'on day'} disabled={disabled}>
                <DaysInput
                    value={day}
                    onValueChange={onDayChange}
                    disabled={disabled}
                    min={1}
                    max={31}
                />
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
export default MonthlyInputs;
