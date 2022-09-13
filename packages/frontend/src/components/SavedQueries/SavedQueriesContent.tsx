import { Button } from '@blueprintjs/core';
import { Breadcrumbs2 } from '@blueprintjs/popover2';
import { LightdashMode, SpaceQuery } from '@lightdash/common';
import { useHistory } from 'react-router-dom';
import { useApp } from '../../providers/AppProvider';
import {
    PageBreadcrumbsWrapper,
    PageContentWrapper,
    PageHeader,
} from '../common/Page/Page.styles';
import ResourceList from '../common/ResourceList';

type SavedQueriesContentProps = {
    savedQueries: SpaceQuery[];
    projectUuid: string;
    title: string;
};

const SavedQueriesContent = ({
    savedQueries,
    projectUuid,
    title,
}: SavedQueriesContentProps) => {
    const history = useHistory();
    const { user, health } = useApp();
    const isDemo = health.data?.mode === LightdashMode.DEMO;

    const orderedCharts = savedQueries.sort(
        (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    return (
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
                            { text: title },
                        ]}
                    />
                </PageBreadcrumbsWrapper>

                {user.data?.ability?.can('manage', 'Dashboard') && !isDemo && (
                    <Button
                        text="Create chart"
                        icon="plus"
                        onClick={() => {
                            // createDashboard({
                            //     name: DEFAULT_DASHBOARD_NAME,
                            //     tiles: [],
                            // })
                        }}
                        intent="primary"
                    />
                )}
            </PageHeader>

            <ResourceList
                resourceIcon="chart"
                resourceType="saved_chart"
                resourceList={orderedCharts}
                getURL={({ uuid }) => `/projects/${projectUuid}/saved/${uuid}`}
            />
        </PageContentWrapper>
    );
};

export default SavedQueriesContent;
