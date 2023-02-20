import { Callout } from '@blueprintjs/core';
import { DbtProjectType } from '@lightdash/common';
import React, { FC } from 'react';
import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import Input from '../../ReactHookForm/Input';
import PasswordInput from '../../ReactHookForm/PasswordInput';
import { useProjectFormContext } from '../ProjectFormProvider';

const DbtCloudForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.DBT_CLOUD_IDE;
    return (
        <>
            <Callout intent="primary" style={{ marginBottom: 20 }}>
                You will need to spin up the IDE for your project. Read the{' '}
                <a
                    href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#spin-up-the-ide"
                    target="_blank"
                    rel="noreferrer"
                >
                    docs
                </a>{' '}
                to know more.
            </Callout>
            <PasswordInput
                name="dbt.api_key"
                label="API key"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#how-to-get-your-api-key"
                rules={{
                    required: requireSecrets ? 'Required field' : undefined,
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('API key'),
                    },
                }}
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                disabled={disabled}
            />
            <Input
                name="dbt.account_id"
                label="Account ID"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#how-to-get-your-account-id-and-project-id-from-your-dbt-cloud-project"
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Account ID'),
                    },
                }}
                disabled={disabled}
            />
            <Input
                name="dbt.project_id"
                label="Project ID"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#how-to-get-your-account-id-and-project-id-from-your-dbt-cloud-project"
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Project ID'),
                    },
                }}
                disabled={disabled}
            />
            <Input
                name="dbt.environment_id"
                label="Environment ID"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#how-to-get-your-environment-id"
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Environment ID'),
                    },
                }}
                disabled={disabled}
            />
        </>
    );
};

export default DbtCloudForm;
