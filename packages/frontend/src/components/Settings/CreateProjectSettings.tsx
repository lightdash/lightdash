import { Stack, Text, Title } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { type FC } from 'react';
import { useNavigate, useParams } from 'react-router';
import useApp from '../../providers/App/useApp';
import Page from '../common/Page/Page';
import PageSpinner from '../PageSpinner';
import ProjectTablesConfiguration from '../ProjectTablesConfiguration/ProjectTablesConfiguration';

const CreateProjectSettings: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { health } = useApp();
    if (health.isInitialLoading) {
        return <PageSpinner />;
    }

    const onSuccess = async () => {
        await queryClient.invalidateQueries(['health']);
        await queryClient.refetchQueries(['organization']);
        await navigate(`/projects/${projectUuid}/home`);
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

                {!!projectUuid && (
                    <ProjectTablesConfiguration
                        projectUuid={projectUuid}
                        onSuccess={onSuccess}
                    />
                )}
            </Stack>
        </Page>
    );
};

export default CreateProjectSettings;
