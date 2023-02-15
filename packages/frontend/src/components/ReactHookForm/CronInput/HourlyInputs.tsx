import { FormGroup } from '@blueprintjs/core';
import { NumericInput as NumberInput } from '@blueprintjs/core/lib/esm/components/forms/numericInput';
import React, { FC } from 'react';
import { getHourlyCronExpression, parseCronExpression } from './cronInputUtils';

const HourlyInputs: FC<{
    disabled?: boolean;
    cronExpression: string;
    onChange: (value: string) => void;
}> = ({ disabled, cronExpression, onChange }) => {
    const minutes = parseCronExpression(cronExpression).minutes;

    const onMinuteChange = (valueAsNumber: number) => {
        if (valueAsNumber >= 0 && valueAsNumber <= 59) {
            onChange(getHourlyCronExpression(valueAsNumber));
        }
    };

    return (
        <FormGroup label={'at minute(s) *'} disabled={disabled}>
            <NumberInput
                fill
                value={minutes}
                onValueChange={onMinuteChange}
                disabled={disabled}
                min={0}
                max={59}
            />
        </FormGroup>
    );
};
export default HourlyInputs;
