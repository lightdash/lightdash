import { TextInput } from '@mantine/core';
import cronstrue from 'cronstrue';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { isInvalidCronExpression } from '../../utils/fieldValidators';

const CustomInputs: FC<{
    name: string;
    disabled?: boolean;
    cronExpression: string;
    error?: string;
    onChange: (value: string) => void;
}> = ({ name, disabled, cronExpression, error, onChange }) => {
    const { t } = useTranslation('scheduler');
    const cronHelperText = useMemo(() => {
        const validationError = isInvalidCronExpression(
            t('cronInput.cronExpression'),
        )(cronExpression);
        const cronHumanString = cronstrue.toString(cronExpression, {
            verbose: true,
            throwExceptionOnParseError: false,
        });
        return validationError ?? cronHumanString;
    }, [cronExpression, t]);

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
