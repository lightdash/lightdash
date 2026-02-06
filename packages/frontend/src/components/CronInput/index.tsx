import { Group } from '@mantine/core';
import {
    useCallback,
    useEffect,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
import CustomInputs from './CustomInputs';
import DailyInputs from './DailyInputs';
import FrequencySelect from './FrequencySelect';
import HourlyInputs from './HourlyInputs';
import MonthlyInputs from './MonthlyInputs';
import WeeklyInputs from './WeeklyInputs';
import {
    Frequency,
    getFrequencyCronExpression,
    mapCronExpressionToFrequency,
} from './cronInputUtils';

type CronInternalInputsProps = {
    name: string;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    error?: string;
    onBlur?: () => void;
};

export const CronInternalInputs: FC<
    PropsWithChildren<CronInternalInputsProps>
> = ({ name, value, disabled, onChange, error, children }) => {
    const [frequency, setFrequency] = useState<Frequency>(
        mapCronExpressionToFrequency(value),
    );

    useEffect(() => {
        if (frequency !== Frequency.CUSTOM) {
            setFrequency(mapCronExpressionToFrequency(value));
        }
    }, [frequency, value]);

    const onFrequencyChange = useCallback(
        (newFrequency: Frequency | null | string) => {
            setFrequency(newFrequency as Frequency);
            onChange(
                getFrequencyCronExpression(newFrequency as Frequency, value),
            );
        },
        [onChange, value],
    );

    return (
        <Group spacing="sm" align="flex-start">
            <FrequencySelect
                value={frequency}
                disabled={disabled}
                onChange={onFrequencyChange}
            />
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
                    error={error}
                />
            )}
            {children}
        </Group>
    );
};
