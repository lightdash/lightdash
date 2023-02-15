import { FormGroup, InputGroup } from '@blueprintjs/core';
import { ErrorMessage } from '@hookform/error-message';
import cronstrue from 'cronstrue';
import React, { FC, useMemo } from 'react';
import { get, useFormContext } from 'react-hook-form';
import { isInvalidCronExpression } from '../../../utils/fieldValidators';

const CustomInputs: FC<{
    name: string;
    disabled?: boolean;
    cronExpression: string;
    onChange: (value: string) => void;
}> = ({ name, disabled, cronExpression, onChange }) => {
    const {
        formState: { errors },
    } = useFormContext();
    const cronHelperText = useMemo(() => {
        const validationError =
            isInvalidCronExpression('Cron expression')(cronExpression);
        const cronHumanString = cronstrue.toString(cronExpression, {
            verbose: true,
            throwExceptionOnParseError: false,
        });
        return validationError ?? cronHumanString;
    }, [cronExpression]);
    const error = get(errors, name);
    return (
        <FormGroup
            label={'Cron expression (UTC) *'}
            className={'input-wrapper'}
            disabled={disabled}
            intent={get(errors, name) ? 'danger' : 'none'}
            helperText={
                error ? (
                    <ErrorMessage errors={errors} name={name} as="p" />
                ) : (
                    cronHelperText
                )
            }
        >
            <InputGroup
                name="cron"
                value={cronExpression}
                placeholder="0 9 * * 1"
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
            />
        </FormGroup>
    );
};
export default CustomInputs;
