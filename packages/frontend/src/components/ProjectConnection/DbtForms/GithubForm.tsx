import React, { FC } from 'react';
import Input from '../../ReactHookForm/Input';
import PasswordInput from '../../ReactHookForm/PasswordInput';

const GithubForm: FC<{ disabled: boolean }> = ({ disabled }) => (
    <>
        <PasswordInput
            name="dbt.personal_access_token"
            label="Personal access token"
            documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#personal-access-token"
            rules={{
                required: 'Required field',
            }}
            placeholder={disabled ? '*******' : undefined}
            disabled={disabled}
        />
        <Input
            name="dbt.repository"
            label="Repository"
            documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#repository"
            rules={{
                required: 'Required field',
            }}
            disabled={disabled}
        />
        <Input
            name="dbt.branch"
            label="Branch"
            documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#branch"
            rules={{
                required: 'Required field',
            }}
            disabled={disabled}
        />
        <Input
            name="dbt.project_sub_path"
            label="Project directory path"
            documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#project-directory-path"
            rules={{
                required: 'Required field',
            }}
            disabled={disabled}
        />
    </>
);

export default GithubForm;
