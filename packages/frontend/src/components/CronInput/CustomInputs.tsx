import { TextInput } from '@mantine/core';
import cronstrue from 'cronstrue';
import { useMemo, type FC } from 'react';
import { isInvalidCronExpression } from '../../utils/fieldValidators';

const CustomInputs: FC<{
    name: string;
    disabled?: boolean;
    cronExpression: string;
    error?: string;
    onChange: (value: string) => void;
}> = ({ name, disabled, cronExpression, error, onChange }) => {
    const cronHelperText = useMemo(() => {
        const validationError =
            isInvalidCronExpression('Cron expression')(cronExpression);
        const cronHumanString = cronstrue.toString(cronExpression, {
            verbose: true,
            throwExceptionOnParseError: false,
        });
        return validationError ?? cronHumanString;
    }, [cronExpression]);

    return (
        <TextInput
            name={name}
            maw="350px"
            withAsterisk
            value={cronExpression}
            placeholder="0 9 * * 1"
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            inputWrapperOrder={['label', 'input', 'description', 'error']}
            description={!error && cronHelperText}
            error={error}
        />
    );
};
export default CustomInputs;
