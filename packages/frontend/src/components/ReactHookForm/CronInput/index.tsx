import { FormGroup } from '@blueprintjs/core';
import { ErrorMessage } from '@hookform/error-message';
import React, { FC, useCallback, useState } from 'react';
import {
    Controller,
    ControllerRenderProps,
    FieldValues,
    useFormContext,
} from 'react-hook-form';
import { InputWrapperProps } from '../InputWrapper';
import {
    getFrequencyCronExpression,
    mapCronExpressionToFrequency,
} from './cronInputUtils';
import CustomInputs from './CustomInputs';
import DailyInputs from './DailyInputs';
import FrequencySelect, { Frequency } from './FrequencySelect';
import HourlyInputs from './HourlyInputs';
import MonthlyInputs from './MonthlyInputs';
import WeeklyInputs from './WeeklyInputs';

const CronInternalInputs: FC<
    {
        disabled: boolean | undefined;
    } & ControllerRenderProps<FieldValues, string>
> = ({ value, disabled, onChange }) => {
    const [frequency, setFrequency] = useState<Frequency>(
        mapCronExpressionToFrequency(value),
    );

    const onFrequencyChange = useCallback(
        (newFrequency: Frequency) => {
            setFrequency(newFrequency);
            onChange(getFrequencyCronExpression(newFrequency, value));
        },
        [onChange, value],
    );

    return (
        <div>
            <FormGroup label={'Frequency *'}>
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
                <CustomInputs cronExpression={value} onChange={onChange} />
            )}
        </div>
    );
};

export const CronInput: FC<
    Pick<InputWrapperProps, 'disabled' | 'rules' | 'name' | 'defaultValue'>
> = ({ name, rules, defaultValue, disabled }) => {
    const {
        control,
        formState: { errors },
    } = useFormContext();
    // TODO: show error
    return (
        <div>
            <Controller
                control={control}
                name={name}
                rules={rules}
                defaultValue={defaultValue}
                render={({ field }) => (
                    <CronInternalInputs disabled={disabled} {...field} />
                )}
            />
            <ErrorMessage errors={errors} name={name} as="p" />
        </div>
    );
};

export default CronInput;
