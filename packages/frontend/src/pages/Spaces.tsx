import { NonIdealState, Spinner } from '@blueprintjs/core';
import { Breadcrumbs2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import { FC } from 'react';
import { Helmet } from 'react-helmet';
import { useHistory, useParams } from 'react-router-dom';
import ErrorState from '../components/common/ErrorState';
import Page from '../components/common/Page/Page';
import {
    PageBreadcrumbsWrapper,
    PageContentWrapper,
    PageHeader,
} from '../components/common/Page/Page.styles';
import {
    ResourceBreadcrumbTitle,
    ResourceTag,
} from '../components/common/ResourceList/ResourceList.styles';
import SpaceBrowser from '../components/Explorer/SpaceBrowser';
import ForbiddenPanel from '../components/ForbiddenPanel';
import { useSpaces } from '../hooks/useSpaces';
import { useApp } from '../providers/AppProvider';

const Spaces: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: spaces, isLoading, error } = useSpaces(projectUuid);
    const { user } = useApp();
    const history = useHistory();

    if (
        user.data?.ability?.cannot(
            'view',
            subject('Space', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        )
    ) {
        return <ForbiddenPanel />;
    }

    if (isLoading) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState title="Loading..." icon={<Spinner />} />
            </div>
        );
    }

    if (error) {
        return <ErrorState error={error.error} />;
    }

    return (
        <Page>
            <Helmet>
                <title>Spaces - Lightdash</title>
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
                                    onClick: () => history.push('/home'),
                                },
                                {
                                    text: (
                                        <ResourceBreadcrumbTitle>
                                            All spaces
                                            {spaces && spaces.length > 0 && (
                                                <ResourceTag round>
                                                    {spaces.length}
                                                </ResourceTag>
                                            )}
                                        </ResourceBreadcrumbTitle>
                                    ),
                                },
                            ]}
                        />
                    </PageBreadcrumbsWrapper>
                </PageHeader>

                <SpaceBrowser projectUuid={projectUuid} />
            </PageContentWrapper>
        </Page>
    );
};

export default Spaces;
