import { DbtProjectType } from '@lightdash/common';
import { Alert, Anchor, Stack } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import React, { type FC } from 'react';
import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import MantineIcon from '../../common/MantineIcon';
import Input from '../../ReactHookForm/Input';
import PasswordInput from '../../ReactHookForm/PasswordInput';
import { useProjectFormContext } from '../useProjectFormContext';

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
                    The dbt job that builds your project must{' '}
                    <b>generate docs</b>.
                </p>
                <p>
                    After your job finish you need to click the "refresh dbt"
                    button in Lightdash to sync your project.
                </p>
            </Alert>
            <PasswordInput
                name="dbt.api_key"
                label="Service token"
                description={
                    <p>
                        The service token must have the "Metadata Only"
                        permission.
                    </p>
                }
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
                description={
                    <p>
                        The unique identifier for the dbt production
                        environment, you can retrieve this from the dbt Cloud
                        URL when you navigate to Environments under Deploy.
                    </p>
                }
                documentationUrl="https://docs.getdbt.com/docs/dbt-cloud-apis/sl-jdbc#connection-parameters"
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Environment ID'),
                    },
                }}
                disabled={disabled}
            />
            <Input
                name="dbt.discovery_api_endpoint"
                label="Discovery API endpoint"
                description={
                    <p>
                        Use the endpoint that's appropriate for your{' '}
                        <Anchor
                            target="_blank"
                            href="https://docs.getdbt.com/docs/dbt-cloud-apis/discovery-querying#discovery-api-endpoints"
                            rel="noreferrer"
                        >
                            region and plan
                        </Anchor>
                        .
                    </p>
                }
                rules={{
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces(
                            'Discovery API endpoint',
                        ),
                    },
                }}
                placeholder={'https://metadata.cloud.getdbt.com/graphql'}
                disabled={disabled}
            />
        </Stack>
    );
};

export default DbtCloudForm;
