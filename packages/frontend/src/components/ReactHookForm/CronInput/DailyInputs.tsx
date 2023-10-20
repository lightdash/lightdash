import { Classes, FormGroup } from '@blueprintjs/core';
import { TimeInput } from '@mantine/dates';
import dayjs from 'dayjs';
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

    const onTimeChange = (timeString: string) => {
        const parts = timeString.split(':');
        const date = new Date();
        date.setHours(Number(parts[0]));
        date.setMinutes(Number(parts[1]));

        if (date && date.toString() !== 'Invalid Date') {
            onChange(
                getDailyCronExpression(date.getMinutes(), date.getHours()),
            );
        }
    };

    return (
        <InlinedInputs>
            <FormGroup inline label={'at'} disabled={disabled}>
                <TimeInput
                    disabled={disabled}
                    value={dayjs(getTimePickerValue(hours, minutes)).format(
                        'HH:mm',
                    )}
                    onChange={(val) => onTimeChange(val.target.value)}
                />
            </FormGroup>
            <InlinedLabel className={Classes.LABEL}>UTC</InlinedLabel>
        </InlinedInputs>
    );
};
export default DailyInputs;
