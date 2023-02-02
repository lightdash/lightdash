import { Button } from '@blueprintjs/core';
import { Breadcrumbs2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import { LightdashMode } from '@lightdash/common';
import { FC } from 'react';
import { Helmet } from 'react-helmet';
import { useHistory, useParams } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import {
    PageBreadcrumbsWrapper,
    PageContentWrapper,
    PageHeader,
} from '../components/common/Page/Page.styles';
import ResourceList from '../components/common/ResourceList';
import {
    ResourceBreadcrumbTitle,
    ResourceEmptyStateHeader,
    ResourceEmptyStateIcon,
    ResourceTag,
} from '../components/common/ResourceList/ResourceList.styles';
import { SortDirection } from '../components/common/ResourceList/ResourceTable';
import {
    ResourceListType,
    wrapResourceList,
} from '../components/common/ResourceList/ResourceTypeUtils';
import { LoadingChart } from '../components/SimpleChart';
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
        return <LoadingChart />;
    }

    const handleCreateChart = () => {
        history.push(`/projects/${projectUuid}/tables`);
    };

    return (
        <Page>
            <Helmet>
                <title>Saved charts - Lightdash</title>
            </Helmet>
            <PageContentWrapper>
                <PageHeader>
                    <PageBreadcrumbsWrapper>
                        <Breadcrumbs2
                            items={[
                                {
                                    href: '/home',
                                    text: 'Home',
                                    className: 'home-breadcrumb',
                                    onClick: (e) => {
                                        history.push('/home');
                                    },
                                },
                                {
                                    text: (
                                        <ResourceBreadcrumbTitle>
                                            All saved charts
                                            {savedQueries.length > 0 && (
                                                <ResourceTag round>
                                                    {savedQueries.length}
                                                </ResourceTag>
                                            )}
                                        </ResourceBreadcrumbTitle>
                                    ),
                                },
                            ]}
                        />
                    </PageBreadcrumbsWrapper>

                    {userCanManageCharts && !isDemo && savedQueries.length > 0 && (
                        <Button
                            icon="plus"
                            intent="primary"
                            onClick={handleCreateChart}
                        >
                            Create chart
                        </Button>
                    )}
                </PageHeader>

                <ResourceList
                    items={wrapResourceList(
                        savedQueries,
                        ResourceListType.CHART,
                    )}
                    defaultSort={{ updatedAt: SortDirection.DESC }}
                    renderEmptyState={() => (
                        <>
                            <ResourceEmptyStateIcon icon="chart" size={40} />

                            <ResourceEmptyStateHeader>
                                No charts added yet
                            </ResourceEmptyStateHeader>

                            {!isDemo && userCanManageCharts && (
                                <Button
                                    icon="plus"
                                    intent="primary"
                                    onClick={handleCreateChart}
                                >
                                    Create chart
                                </Button>
                            )}
                        </>
                    )}
                />
            </PageContentWrapper>
        </Page>
    );
};

export default SavedQueries;
