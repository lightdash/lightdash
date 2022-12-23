import { Card, Intent, NonIdealState } from '@blueprintjs/core';
import { CreateDbtCloudIntegration } from '@lightdash/common/dist/types/dbtCloud';
import { FC, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
    useProjectDbtCloud,
    useProjectDbtCloudDeleteMutation,
    useProjectDbtCloudUpdateMutation,
} from '../../hooks/dbtCloud/useProjectDbtCloudSettings';
import { Subtitle } from '../../pages/CreateProject.styles';
import {
    ButtonsWrapper,
    Header,
    SaveButton,
    Title,
    TitleWrapper,
} from '../../pages/ProjectSettings.styles';
import Form from '../ReactHookForm/Form';
import Input from '../ReactHookForm/Input';
import PasswordInput from '../ReactHookForm/PasswordInput';

interface DbtCloudSettingsProps {
    projectUuid: string;
}
const DbtCloudSettings: FC<DbtCloudSettingsProps> = ({ projectUuid }) => {
    const form = useForm<CreateDbtCloudIntegration>({
        mode: 'onSubmit',
        defaultValues: {
            metricsJobId: '',
            serviceToken: '',
        },
    });

    const dbtCloudSettings = useProjectDbtCloud(projectUuid, {
        onSuccess: (data) => {
            form.setValue('metricsJobId', data?.metricsJobId ?? '');
        },
    });
    const updateDbtCloud = useProjectDbtCloudUpdateMutation(projectUuid);
    const deletDbtCloud = useProjectDbtCloudDeleteMutation(projectUuid);

    const handleSubmit = (data: CreateDbtCloudIntegration) => {
        updateDbtCloud.mutate(data);
    };

    const handleClear = async () => {
        deletDbtCloud.mutate(undefined);
    };

    return (
        <>
            <Header>
                <TitleWrapper>
                    <Title marginBottom>Connect to dbt Cloud</Title>
                </TitleWrapper>
            </Header>
            <Subtitle>
                Connect Lightdash to your dbt Cloud account to start consuming
                metrics from the dbt semantic layer and using dbt jinja in your
                queries. To get started we recommend following the{' '}
                <a href="https://docs.lightdash.com/guides/dbt-semantic-layer">
                    dbt cloud semantic layer guide
                </a>{' '}
                in the Lightdash docs.
            </Subtitle>
            <Card>
                {dbtCloudSettings.error ? (
                    <NonIdealState
                        title={dbtCloudSettings.error.error.message}
                        icon="error"
                    />
                ) : (
                    <Form
                        name="integration_dbt_cloud"
                        methods={form}
                        onSubmit={handleSubmit}
                    >
                        <PasswordInput
                            name="serviceToken"
                            label="Service Token"
                            disabled={dbtCloudSettings.isLoading}
                            placeholder="Enter your token..."
                            rules={{
                                required: 'Required field',
                            }}
                            labelHelp="Service tokens can be found in your dbt Cloud account settings: https://cloud.getdbt.com/next/settings - token needs at least 'metadata only' permissions."
                        />

                        <Input
                            name="metricsJobId"
                            label="Job ID"
                            disabled={dbtCloudSettings.isLoading}
                            rules={{
                                required: 'Required field',
                            }}
                            labelHelp="Your Job ID can be found by clicking Deploy > Jobs in the top bar in dbt Cloud. The Job ID in is the number in the URL after /jobs/12345."
                        />
                        <ButtonsWrapper>
                            {dbtCloudSettings.data?.metricsJobId && (
                                <SaveButton
                                    text="Clear"
                                    onClick={() => handleClear()}
                                />
                            )}
                            <SaveButton
                                type="submit"
                                intent={Intent.PRIMARY}
                                text="Save"
                                loading={dbtCloudSettings.isLoading}
                            />
                        </ButtonsWrapper>
                    </Form>
                )}
            </Card>
        </>
    );
};

export default DbtCloudSettings;
