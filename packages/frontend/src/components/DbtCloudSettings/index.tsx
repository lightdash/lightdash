import { Card, Intent, NonIdealState } from '@blueprintjs/core';
import { CreateDbtCloudIntegration } from '@lightdash/common/dist/types/dbtCloud';
import React, { FC, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
    useProjectDbtCloud,
    useProjectDbtCloudUpdateMutation,
} from '../../hooks/dbtCloud/useProjectDbtCloudSettings';
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

const DbtCloudSettings: FC = () => {
    const dbtCloudSettings = useProjectDbtCloud();
    const update = useProjectDbtCloudUpdateMutation();
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
        <Content>
            <ContentContainer>
                <Header>
                    <TitleWrapper>
                        <Title marginBottom>dbt cloud integration</Title>
                    </TitleWrapper>
                </Header>
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
                            />

                            <Input
                                name="metricsJobId"
                                label="Job ID"
                                disabled={dbtCloudSettings.isLoading}
                                rules={{
                                    required: 'Required field',
                                }}
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
            </ContentContainer>
        </Content>
    );
};

export default DbtCloudSettings;
