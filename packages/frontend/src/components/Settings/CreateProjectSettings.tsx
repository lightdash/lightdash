import { Stack, Text, Title } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useApp from '../../providers/App/useApp';
import Page from '../common/Page/Page';
import PageSpinner from '../PageSpinner';
import ProjectTablesConfiguration from '../ProjectTablesConfiguration/ProjectTablesConfiguration';

const CreateProjectSettings: FC = () => {
    const { t } = useTranslation('settings');
    const projectUuid = useProjectUuid();
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
                <Stack gap="xxs">
                    <Title order={3} fw={500}>
                        {t('createProject.title')}
                    </Title>

                    <Text c="dimmed">{t('createProject.description')}</Text>
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
