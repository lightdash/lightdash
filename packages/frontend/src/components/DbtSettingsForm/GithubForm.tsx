import React, { FC } from 'react';
import { ProjectType, DbtGithubProjectConfig } from 'common';
import { DefaultValues } from 'react-hook-form/dist/types/form';
import Form from '../ReactHookForm/Form';
import Input from '../ReactHookForm/Input';
import PasswordInput from '../ReactHookForm/PasswordInput';

const defaultValues: DefaultValues<DbtGithubProjectConfig> = {
    type: ProjectType.GITHUB,
    personal_access_token: '',
    repository: '',
    branch: '',
    project_sub_path: '',
    profiles_sub_path: '',
    rpc_server_port: 8580,
    target: undefined,
};

const GithubForm: FC<{
    values?: DbtGithubProjectConfig;
    disabled: boolean;
}> = ({ disabled, values = defaultValues }) => (
    <Form<DbtGithubProjectConfig>
        defaultValues={values}
        disabled={disabled}
        onSubmit={() => undefined}
    >
        <PasswordInput
            name="personal_access_token"
            label="Personal access token"
            rules={{
                required: 'Required field',
            }}
            placeholder={disabled ? '*******' : undefined}
        />
        <Input
            name="repository"
            label="Repository"
            rules={{
                required: 'Required field',
            }}
        />
        <Input
            name="branch"
            label="Branch"
            rules={{
                required: 'Required field',
            }}
        />
        <Input
            name="project_sub_path"
            label="Project directory path"
            rules={{
                required: 'Required field',
            }}
        />
        <Input
            name="profiles_sub_path"
            label="Profiles directory path"
            rules={{
                required: 'Required field',
            }}
        />
        <Input name="target" label="Profile target" />
    </Form>
);

export default GithubForm;
