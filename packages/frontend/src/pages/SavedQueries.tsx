import { subject } from '@casl/ability';
import { LightdashMode } from '@lightdash/common';
import { Button, Center, Group, Stack } from '@mantine/core';
import { IconChartBar, IconPlus } from '@tabler/icons-react';
import { FC } from 'react';
import { Helmet } from 'react-helmet';
import { useHistory, useParams } from 'react-router-dom';
import LoadingState from '../components/common/LoadingState';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import ResourceView from '../components/common/ResourceView';
import {
    ResourceViewItemType,
    wrapResourceView,
} from '../components/common/ResourceView/resourceTypeUtils';
import { SortDirection } from '../components/common/ResourceView/ResourceViewList';
import { useSavedCharts } from '../hooks/useSpaces';
import { useApp } from '../providers/AppProvider';

const SavedQueries: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { isLoading, data: savedQueries = [] } = useSavedCharts(projectUuid);

    const { user, health } = useApp();
    const cannotView = user.data?.ability?.cannot('view', 'SavedChart');

    const history = useHistory();
    const isDemo = health.data?.mode === LightdashMode.DEMO;

    const userCanManageCharts = user.data?.ability?.can(
        'manage',
        subject('SavedChart', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    if (isLoading && !cannotView) {
        return <LoadingState title="Loading charts" />;
    }

    const handleCreateChart = () => {
        history.push(`/projects/${projectUuid}/tables`);
    };

    return (
        <Center my="md">
            <Helmet>
                <title>Saved charts - Lightdash</title>
            </Helmet>
            {/* FIXME: use Mantine sizes for width */}
            <Stack spacing="xl" w={900}>
                <Group position="apart" mt="xs">
                    <PageBreadcrumbs
                        items={[{ href: '/home', title: 'Home' }]}
                        mt="xs"
                    >
                        All saved charts
                    </PageBreadcrumbs>

                    {savedQueries.length > 0 &&
                    !isDemo &&
                    userCanManageCharts ? (
                        <Button
                            leftIcon={<IconPlus size={18} />}
                            onClick={handleCreateChart}
                        >
                            Create chart
                        </Button>
                    ) : undefined}
                </Group>

                <ResourceView
                    items={wrapResourceView(
                        savedQueries,
                        ResourceViewItemType.CHART,
                    )}
                    listProps={{
                        defaultSort: { updatedAt: SortDirection.DESC },
                    }}
                    emptyStateProps={{
                        icon: <IconChartBar size={30} />,
                        title: 'No charts added yet',
                        action:
                            !isDemo && userCanManageCharts ? (
                                <Button onClick={handleCreateChart}>
                                    Create chart
                                </Button>
                            ) : undefined,
                    }}
                />
            </Stack>
        </Center>
    );
};

export default SavedQueries;
