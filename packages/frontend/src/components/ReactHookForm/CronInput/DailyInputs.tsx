import { Classes, FormGroup } from '@blueprintjs/core';
import { TimePicker } from '@blueprintjs/datetime';
import React, { FC } from 'react';
import { InlinedInputs, InlinedLabel } from './CronInput.styles';
import {
    getDailyCronExpression,
    getTimePickerValue,
    parseCronExpression,
} from './cronInputUtils';

const DailyInputs: FC<{
    disabled?: boolean;
    cronExpression: string;
    onChange: (value: string) => void;
}> = ({ disabled, cronExpression, onChange }) => {
    const { minutes, hours } = parseCronExpression(cronExpression);

    const onTimeChange = (date: Date) => {
        if (date) {
            onChange(
                getDailyCronExpression(date.getMinutes(), date.getHours()),
            );
        }
    };

    return (
        <InlinedInputs>
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
export default DailyInputs;
