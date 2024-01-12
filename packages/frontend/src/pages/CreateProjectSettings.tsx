import { useQueryClient } from '@tanstack/react-query';
import { FC } from 'react';
import { useHistory, useParams } from 'react-router-dom';

import { Stack, Text, Title } from '@mantine/core';
import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import ProjectTablesConfiguration from '../components/ProjectTablesConfiguration/ProjectTablesConfiguration';
import { useApp } from '../providers/AppProvider';

const CreateProjectSettings: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const history = useHistory();
    const { health } = useApp();
    if (health.isInitialLoading) {
        return <PageSpinner />;
    }

    const onSuccess = async () => {
        await queryClient.invalidateQueries(['health']);
        await queryClient.refetchQueries(['organization']);
        history.push({
            pathname: `/projects/${projectUuid}/home`,
        });
    };

    return (
        <Page withFixedContent withPaddedContent>
            <Stack pt={60}>
                <Stack spacing="xxs">
                    <Title order={3} fw={500}>
                        Your project has connected successfully! 🎉{' '}
                    </Title>

                    <Text color="dimmed">
                        Before you start exploring your data, pick the dbt
                        models you want to appear as tables in Lightdash. You
                        can always adjust this in your project settings later.
                    </Text>
                </Stack>

                <ProjectTablesConfiguration
                    projectUuid={projectUuid}
                    onSuccess={onSuccess}
                />
            </Stack>
        </Page>
    );
};

export default CreateProjectSettings;
