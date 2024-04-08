import { Group } from '@mantine/core';
import React, { useCallback, useEffect, useState, type FC } from 'react';
import {
    Controller,
    useFormContext,
    type ControllerRenderProps,
    type FieldValues,
} from 'react-hook-form';
import { type InputWrapperProps } from '../InputWrapper';
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

// TODO: this type is a bit of a mess because this component is used
// both in react-hook-form forms as well as mantine forms. If/when
// we move away from one of them, this should get simplified.
export const CronInternalInputs: FC<
    {
        disabled: boolean | undefined;
        error?: string;
        errors?: {
            [x: string]: any;
        };
        onBlur?: () => void;
    } & Omit<ControllerRenderProps<FieldValues, string>, 'ref' | 'onBlur'>
> = ({ value, disabled, onChange, name, error, errors, timeZone }) => {
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
        <Group spacing="sm">
            <FrequencySelect
                value={frequency}
                disabled={disabled}
                onChange={onFrequencyChange}
            />
            {frequency === Frequency.HOURLY && (
                <HourlyInputs cronExpression={value} onChange={onChange} />
            )}
            {frequency === Frequency.DAILY && (
                <DailyInputs cronExpression={value} timeZone={timeZone} onChange={onChange} />
            )}
            {frequency === Frequency.WEEKLY && (
                <WeeklyInputs cronExpression={value} timeZone={timeZone} onChange={onChange} />
            )}
            {frequency === Frequency.MONTHLY && (
                <MonthlyInputs cronExpression={value} timeZone={timeZone} onChange={onChange} />
            )}
            {frequency === Frequency.CUSTOM && (
                <CustomInputs
                    name={name}
                    cronExpression={value}
                    onChange={onChange}
                    errors={errors}
                    error={error}
                />
            )}
        </Group>
    );
};

const CronInput: FC<
    Pick<InputWrapperProps, 'disabled' | 'rules' | 'name' | 'defaultValue'>
> = ({ name, rules, defaultValue, disabled }) => {
    const {
        control,
        formState: { errors },
    } = useFormContext();
    return (
        <Controller
            control={control}
            name={name}
            rules={rules}
            defaultValue={defaultValue}
            render={({ field }) => (
                <CronInternalInputs
                    disabled={disabled}
                    {...field}
                    errors={errors}
                />
            )}
        />
    );
};

export default CronInput;
