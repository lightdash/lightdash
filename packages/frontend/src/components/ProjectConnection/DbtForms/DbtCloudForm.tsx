import React, { FC } from 'react';
import Input from '../../ReactHookForm/Input';
import PasswordInput from '../../ReactHookForm/PasswordInput';

const DbtCloudForm: FC<{ disabled: boolean }> = ({ disabled }) => (
    <>
        <PasswordInput
            name="dbt.apiKey"
            label="API key"
            rules={{
                required: 'Required field',
            }}
            placeholder={disabled ? '*******' : undefined}
            disabled={disabled}
        />
        <Input
            name="dbt.account_id"
            label="Account ID"
            rules={{
                required: 'Required field',
            }}
            disabled={disabled}
        />
        <Input
            name="dbt.environment_id"
            label="Environment ID"
            rules={{
                required: 'Required field',
            }}
            disabled={disabled}
        />
        <Input
            name="dbt.project_id"
            label="Project ID"
            rules={{
                required: 'Required field',
            }}
            disabled={disabled}
        />
    </>
);

export default DbtCloudForm;
