import { FormGroup, InputGroup } from '@blueprintjs/core';
import cronstrue from 'cronstrue';
import React, { FC, useMemo } from 'react';
import { isInvalidCronExpression } from '../../../utils/fieldValidators';

const CustomInputs: FC<{
    disabled?: boolean;
    cronExpression: string;
    onChange: (value: string) => void;
}> = ({ disabled, cronExpression, onChange }) => {
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
        <FormGroup
            label={'Cron expression (UTC) *'}
            disabled={disabled}
            helperText={cronHelperText}
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
