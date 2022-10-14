import { Intent, NonIdealState } from '@blueprintjs/core';
import { CreateDbtCloudIntegration } from '@lightdash/common/dist/types/dbtCloud';
import React, { FC, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
    useProjectDbtCloud,
    useProjectDbtCloudUpdateMutation,
} from '../../hooks/dbtCloud/useProjectDbtCloudSettings';
import {
    ContentContainer,
    Header,
    Title,
    TitleWrapper,
} from '../../pages/ProjectSettings.styles';
import Content from '../common/Page/Content';
import { FormWrapper } from '../ProjectConnection/ProjectConnection.styles';
import { SaveButton } from '../ProjectTablesConfiguration/ProjectTablesConfiguration.styles';
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
                <FormWrapper>
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
                                label="Metrics Job ID"
                                disabled={dbtCloudSettings.isLoading}
                                rules={{
                                    required: 'Required field',
                                }}
                            />

                            <SaveButton
                                type="submit"
                                intent={Intent.PRIMARY}
                                text="Save"
                                loading={dbtCloudSettings.isLoading}
                            />
                        </Form>
                    )}
                </FormWrapper>
            </ContentContainer>
        </Content>
    );
};

export default DbtCloudSettings;
