import { DbtProjectType } from '@lightdash/common';
import { Alert, Stack } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import React, { type FC } from 'react';
import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import MantineIcon from '../../common/MantineIcon';
import Input from '../../ReactHookForm/Input';
import PasswordInput from '../../ReactHookForm/PasswordInput';
import { useProjectFormContext } from '../ProjectFormProvider';

const DbtCloudForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.DBT_CLOUD_IDE;

    return (
        <Stack>
            <Alert
                icon={<MantineIcon icon={IconInfoCircle} size={'md'} />}
                title="Requirements"
                variant="light"
            >
                <p>
                    The dbt job that builds your project must also generate docs
                    and your API key must have the access to the Discovery API.
                </p>
                <p>
                    After your job finish you need to click the "refresh dbt"
                    button in your explore to sync your project.
                </p>
            </Alert>
            <PasswordInput
                name="dbt.api_key"
                label="API key"
                documentationUrl="https://docs.getdbt.com/docs/dbt-cloud-apis/service-tokens"
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
                name="dbt.environment_id"
                label="Environment ID"
                documentationUrl="https://docs.getdbt.com/docs/dbt-cloud-apis/sl-jdbc#connection-parameters"
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Environment ID'),
                    },
                }}
                disabled={disabled}
            />
        </Stack>
    );
};

export default DbtCloudForm;
