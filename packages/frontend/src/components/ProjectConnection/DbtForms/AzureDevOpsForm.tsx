import { DbtProjectType } from '@lightdash/common';
import React, { FC } from 'react';
import {
    hasNoWhiteSpaces,
    startWithSlash,
} from '../../../utils/fieldValidators';
import Input from '../../ReactHookForm/Input';
import PasswordInput from '../../ReactHookForm/PasswordInput';
import { useProjectFormContext } from '../ProjectFormProvider';

const AzureDevOpsForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.AZURE_DEVOPS;
    return (
        <>
            <PasswordInput
                name="dbt.personal_access_token"
                label="Personal access token"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#personal-access-token-2"
                rules={{
                    required: requireSecrets ? 'Required field' : undefined,
                }}
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                disabled={disabled}
            />
            <Input
                name="dbt.organization"
                label="Organization"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#organization"
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Repository'),
                    },
                }}
                disabled={disabled}
            />
            <Input
                name="dbt.project"
                label="Project"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#project"
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Repository'),
                    },
                }}
                disabled={disabled}
            />
            <Input
                name="dbt.repository"
                label="Repository"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#repository-2"
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Repository'),
                    },
                }}
                disabled={disabled}
            />
            <Input
                name="dbt.branch"
                label="Branch"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#branch-2"
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Branch'),
                    },
                }}
                disabled={disabled}
                defaultValue="main"
            />
            <Input
                name="dbt.project_sub_path"
                label="Project directory path"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#project-directory-path-2"
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces(
                            'Project directory path',
                        ),
                        startWithSlash: startWithSlash(
                            'Project directory path',
                        ),
                    },
                }}
                disabled={disabled}
                defaultValue="/"
            />
        </>
    );
};

export default AzureDevOpsForm;
