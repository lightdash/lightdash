import React, { FC } from 'react';
import { useQueryClient } from 'react-query';
import { useHistory, useParams } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import ProjectTablesConfiguration from '../components/ProjectTablesConfiguration/ProjectTablesConfiguration';
import { useApp } from '../providers/AppProvider';
import { Subtitle, Title } from './CreateProject.styles';

const CreateProjectSettings: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const history = useHistory();
    const { health } = useApp();
    if (health.isLoading) {
        return <PageSpinner />;
    }

    const onSuccess = async () => {
        await queryClient.invalidateQueries(['health']);
        history.push({
            pathname: `/projects/${projectUuid}/home`,
        });
    };

    return (
        <Page>
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: '800px',
                    paddingTop: 60,
                }}
            >
                <Title marginBottom>
                    Your project has connected successfully! 🎉{' '}
                </Title>
                <Subtitle>
                    Before you start exploring your data, pick the dbt models
                    you wanto to appear as tables in Lightdash. You can always
                    adjust this in your project settings later.
                </Subtitle>
                <ProjectTablesConfiguration
                    projectUuid={projectUuid}
                    onSuccess={onSuccess}
                />
            </div>
        </Page>
    );
};

export default CreateProjectSettings;
