import React, { FC } from 'react';
import { ProjectType, DbtCloudIDEProjectConfig } from 'common';
import { DefaultValues } from 'react-hook-form/dist/types/form';
import Form from '../ReactHookForm/Form';
import Input from '../ReactHookForm/Input';
import PasswordInput from '../ReactHookForm/PasswordInput';

const defaultValues: DefaultValues<DbtCloudIDEProjectConfig> = {
    type: ProjectType.DBT_CLOUD_IDE,
    api_key: '',
    account_id: '',
    environment_id: '',
    project_id: '',
};

const DbtCloudForm: FC<{
    values?: DbtCloudIDEProjectConfig;
    disabled: boolean;
}> = ({ disabled, values = defaultValues }) => (
    <Form<DbtCloudIDEProjectConfig>
        defaultValues={values}
        disabled={disabled}
        onSubmit={() => undefined}
    >
        <PasswordInput
            name="api_key"
            label="API key"
            rules={{
                required: 'Required field',
            }}
            placeholder={disabled ? '*******' : undefined}
        />
        <Input
            name="account_id"
            label="Account ID"
            rules={{
                required: 'Required field',
            }}
        />
        <Input
            name="environment_id"
            label="Environment ID"
            rules={{
                required: 'Required field',
            }}
        />
        <Input
            name="project_id"
            label="Project ID"
            rules={{
                required: 'Required field',
            }}
        />
    </Form>
);

export default DbtCloudForm;
