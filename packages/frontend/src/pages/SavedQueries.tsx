import { ContentType, LightdashMode } from '@lightdash/common';
import { Button, Group, Stack } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import InfiniteResourceTable from '../components/common/ResourceView/InfiniteResourceTable';
import useCreateInAnySpaceAccess from '../hooks/user/useCreateInAnySpaceAccess';
import { useApp } from '../providers/AppProvider';

const SavedQueries: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { health } = useApp();
    const history = useHistory();
    const isDemo = health.data?.mode === LightdashMode.DEMO;

    const userCanCreateCharts = useCreateInAnySpaceAccess(
        projectUuid,
        'SavedChart',
    );

    const handleCreateChart = () => {
        history.push(`/projects/${projectUuid}/tables`);
    };

    return (
        <Page title="Saved charts" withFixedContent withPaddedContent>
            <Stack spacing="xl">
                <Group position="apart">
                    <PageBreadcrumbs
                        items={[
                            { title: 'Home', to: '/home' },
                            { title: 'All saved charts', active: true },
                        ]}
                    />
                    {!isDemo && userCanCreateCharts ? (
                        <Button
                            leftIcon={<IconPlus size={18} />}
                            onClick={handleCreateChart}
                        >
                            Create chart
                        </Button>
                    ) : undefined}
                </Group>

                <InfiniteResourceTable
                    filters={{
                        projectUuid,
                        contentTypes: [ContentType.CHART],
                    }}
                />
            </Stack>
        </Page>
    );
};

export default SavedQueries;
