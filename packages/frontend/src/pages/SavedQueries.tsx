import { subject } from '@casl/ability';
import {
    LightdashMode,
    ResourceViewItemType,
    wrapResourceView,
} from '@lightdash/common';
import { Button, Group, Stack } from '@mantine/core';
import { IconChartBar, IconPlus } from '@tabler/icons-react';
import { FC } from 'react';
import { useHistory, useParams } from 'react-router-dom';

import LoadingState from '../components/common/LoadingState';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import ResourceView from '../components/common/ResourceView';
import { SortDirection } from '../components/common/ResourceView/ResourceViewList';
import { useSavedCharts } from '../hooks/useSpaces';
import { useApp } from '../providers/AppProvider';

const SavedQueries: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { isInitialLoading, data: savedQueries = [] } =
        useSavedCharts(projectUuid);

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

    if (isInitialLoading && !cannotView) {
        return <LoadingState title="Loading charts" />;
    }

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
        </Page>
    );
};

export default SavedQueries;
