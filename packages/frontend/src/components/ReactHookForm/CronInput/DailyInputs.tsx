import { FormGroup } from '@blueprintjs/core';
import { TimePicker } from '@blueprintjs/datetime';
import React, { FC } from 'react';
import { getTimePickerValue, parseCronExpression } from './cronInputUtils';

const DailyInputs: FC<{
    disabled?: boolean;
    cronExpression: string;
    onChange: (value: string) => void;
}> = ({ disabled, cronExpression, onChange }) => {
    const { minutes, hours } = parseCronExpression(cronExpression);

    const onTimeChange = (date: Date) => {
        if (date) {
            onChange(
                [
                    `${date.getMinutes()}`,
                    `${date.getHours()}`,
                    '*',
                    '*',
                    '*',
                ].join(' '),
            );
        }
    };

    return (
        <FormGroup label={'at'} disabled={disabled}>
            <TimePicker
                disabled={disabled}
                value={getTimePickerValue(hours, minutes)}
                onChange={onTimeChange}
            />
        </FormGroup>
    );
};
export default DailyInputs;
