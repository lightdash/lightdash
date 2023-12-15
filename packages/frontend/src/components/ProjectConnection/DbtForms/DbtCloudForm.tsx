import { DbtProjectType } from '@lightdash/common';
import { Alert, Anchor, Stack, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { FC } from 'react';
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
                color="blue"
                icon={<MantineIcon icon={IconInfoCircle} size="lg" />}
            >
                <Text color="blue">
                    You will need to spin up the IDE for your project. Read the{' '}
                    <Anchor
                        href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#spin-up-the-ide"
                        target="_blank"
                        rel="noreferrer"
                    >
                        docs
                    </Anchor>{' '}
                    to know more.
                </Text>
            </Alert>

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
        </Stack>
    );
};

export default DbtCloudForm;
