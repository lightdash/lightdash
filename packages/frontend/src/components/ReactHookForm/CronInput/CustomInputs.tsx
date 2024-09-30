import { TextInput } from '@mantine/core';
import cronstrue from 'cronstrue';
import React, { useMemo, type FC } from 'react';
import { isInvalidCronExpression } from '../../../utils/fieldValidators';

const CustomInputs: FC<{
    name: string;
    disabled?: boolean;
    cronExpression: string;
    // These two error types are from the two form handlers.
    // We should be removing one of them.
    error?: string;
    errors?: {
        [x: string]: any;
    };
    onChange: (value: string) => void;
}> = ({ name, disabled, cronExpression, error, errors, onChange }) => {
    const cronHelperText = useMemo(() => {
        const validationError =
            isInvalidCronExpression('Cron expression')(cronExpression);
        const cronHumanString = cronstrue.toString(cronExpression, {
            verbose: true,
            throwExceptionOnParseError: false,
        });
        return validationError ?? cronHumanString;
    }, [cronExpression]);
    const cronError = error ?? errors?.[name]?.message;

    return (
        <TextInput
            maw="350px"
            withAsterisk
            value={cronExpression}
            placeholder="0 9 * * 1"
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            inputWrapperOrder={['label', 'input', 'description', 'error']}
            description={!cronError && cronHelperText}
            error={cronError}
        />
    );
};
export default CustomInputs;
