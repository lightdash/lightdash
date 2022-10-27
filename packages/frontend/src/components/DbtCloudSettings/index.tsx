import { Card, Intent, NonIdealState } from '@blueprintjs/core';
import { CreateDbtCloudIntegration } from '@lightdash/common/dist/types/dbtCloud';
import React, { FC, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
    useProjectDbtCloud,
    useProjectDbtCloudUpdateMutation,
} from '../../hooks/dbtCloud/useProjectDbtCloudSettings';
import { Subtitle } from '../../pages/CreateProject.styles';
import {
    ButtonsWrapper,
    ContentContainer,
    Header,
    SaveButton,
    Title,
    TitleWrapper,
} from '../../pages/ProjectSettings.styles';
import Content from '../common/Page/Content';
import Form from '../ReactHookForm/Form';
import Input from '../ReactHookForm/Input';
import PasswordInput from '../ReactHookForm/PasswordInput';

interface DbtCloudSettingsProps {
    projectUuid: string;
}
const DbtCloudSettings: FC<DbtCloudSettingsProps> = ({ projectUuid }) => {
    const dbtCloudSettings = useProjectDbtCloud(projectUuid);
    const update = useProjectDbtCloudUpdateMutation(projectUuid);
    const methods = useForm<CreateDbtCloudIntegration>({
        mode: 'onSubmit',
        defaultValues: {
            metricsJobId: dbtCloudSettings.data?.metricsJobId,
        },
    });

    const { setValue } = methods;

    useEffect(() => {
        if (dbtCloudSettings.data) {
            setValue('metricsJobId', dbtCloudSettings.data?.metricsJobId);
        }
    }, [dbtCloudSettings, setValue]);

    const handleSubmit = (data: CreateDbtCloudIntegration) => {
        update.mutate(data);
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
                        methods={methods}
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
