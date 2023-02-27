import { FormGroup } from '@blueprintjs/core';
import React, { FC, useCallback, useEffect, useState } from 'react';
import {
    Controller,
    ControllerRenderProps,
    FieldValues,
    useFormContext,
} from 'react-hook-form';
import { InputWrapperProps } from '../InputWrapper';
import {
    Frequency,
    getFrequencyCronExpression,
    mapCronExpressionToFrequency,
} from './cronInputUtils';
import CustomInputs from './CustomInputs';
import DailyInputs from './DailyInputs';
import FrequencySelect from './FrequencySelect';
import HourlyInputs from './HourlyInputs';
import MonthlyInputs from './MonthlyInputs';
import WeeklyInputs from './WeeklyInputs';

const CronInternalInputs: FC<
    {
        disabled: boolean | undefined;
    } & ControllerRenderProps<FieldValues, string>
> = ({ value, disabled, onChange, name }) => {
    const [frequency, setFrequency] = useState<Frequency>(
        mapCronExpressionToFrequency(value),
    );

    useEffect(() => {
        if (frequency !== Frequency.CUSTOM) {
            setFrequency(mapCronExpressionToFrequency(value));
        }
    }, [frequency, value]);

    const onFrequencyChange = useCallback(
        (newFrequency: Frequency) => {
            setFrequency(newFrequency);
            onChange(getFrequencyCronExpression(newFrequency, value));
        },
        [onChange, value],
    );

    return (
        <div>
            <FormGroup className={'input-wrapper'}>
                <FrequencySelect
                    value={frequency}
                    disabled={disabled}
                    onChange={onFrequencyChange}
                />
            </FormGroup>
            {frequency === Frequency.HOURLY && (
                <HourlyInputs cronExpression={value} onChange={onChange} />
            )}
            {frequency === Frequency.DAILY && (
                <DailyInputs cronExpression={value} onChange={onChange} />
            )}
            {frequency === Frequency.WEEKLY && (
                <WeeklyInputs cronExpression={value} onChange={onChange} />
            )}
            {frequency === Frequency.MONTHLY && (
                <MonthlyInputs cronExpression={value} onChange={onChange} />
            )}
            {frequency === Frequency.CUSTOM && (
                <CustomInputs
                    name={name}
                    cronExpression={value}
                    onChange={onChange}
                />
            )}
        </div>
    );
};

export const CronInput: FC<
    Pick<InputWrapperProps, 'disabled' | 'rules' | 'name' | 'defaultValue'>
> = ({ name, rules, defaultValue, disabled }) => {
    const { control } = useFormContext();
    return (
        <Controller
            control={control}
            name={name}
            rules={rules}
            defaultValue={defaultValue}
            render={({ field }) => (
                <CronInternalInputs disabled={disabled} {...field} />
            )}
        />
    );
};

export default CronInput;
