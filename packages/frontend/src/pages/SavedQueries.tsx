import { ContentType, LightdashMode } from '@lightdash/common';
import { Group, Stack, Button } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import InfiniteResourceTable from '../components/common/ResourceView/InfiniteResourceTable';
import { useContentAuthoringEnabled } from '../hooks/useContentAuthoringEnabled';
import { useProjectUuid } from '../hooks/useProjectUuid';
import useCreateInAnySpaceAccess from '../hooks/user/useCreateInAnySpaceAccess';
import useApp from '../providers/App/useApp';
import { FavoritesProvider } from '../providers/Favorites/FavoritesProvider';

const SavedQueries: FC = () => {
    const { t } = useTranslation('pages');
    const authoringEnabled = useContentAuthoringEnabled();
    const projectUuid = useProjectUuid();
    const { health } = useApp();
    const navigate = useNavigate();
    const isDemo = health.data?.mode === LightdashMode.DEMO;

    const userCanCreateCharts = useCreateInAnySpaceAccess(
        projectUuid,
        'SavedChart',
    );

    const handleCreateChart = () => {
        void navigate(`/projects/${projectUuid}/tables`);
    };

    return (
        <FavoritesProvider projectUuid={projectUuid}>
            <Page
                title={t('savedQueries.title')}
                withCenteredRoot
                withCenteredContent
                withXLargePaddedContent
                withLargeContent
            >
                <Stack gap="xxl" w="100%">
                    <Group justify="space-between">
                        <PageBreadcrumbs
                            items={[
                                { title: t('common.home'), to: '/home' },
                                {
                                    title: t('savedQueries.allSavedCharts'),
                                    active: true,
                                },
                            ]}
                        />
                        {!isDemo && userCanCreateCharts ? (
                            <Button
                                display={authoringEnabled ? undefined : 'none'}
                                leftSection={<IconPlus size={18} />}
                                onClick={handleCreateChart}
                            >
                                {t('savedQueries.createChart')}
                            </Button>
                        ) : undefined}
                    </Group>

                    {projectUuid ? (
                        <InfiniteResourceTable
                            filters={{
                                projectUuid,
                                contentTypes: [ContentType.CHART],
                            }}
                        />
                    ) : null}
                </Stack>
            </Page>
        </FavoritesProvider>
    );
};

export default SavedQueries;
