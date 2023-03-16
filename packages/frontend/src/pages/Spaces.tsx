import { Breadcrumbs2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import { Stack } from '@mantine/core';
import { FC } from 'react';
import { Helmet } from 'react-helmet';
import { useHistory, useParams } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import {
    PageBreadcrumbsWrapper,
    PageHeader,
} from '../components/common/Page/Page.styles';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import SpaceBrowser from '../components/Explorer/SpaceBrowser';
import ForbiddenPanel from '../components/ForbiddenPanel';
import { useApp } from '../providers/AppProvider';

const Spaces: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
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
    // test purposes only! will remove before merging
    const breadCrumbsItems = [
        {
            title: 'Home',
            href: '#home',
        },
    ];

    return (
        <Page>
            <Helmet>
                <title>Spaces - Lightdash</title>
            </Helmet>

            <Stack spacing="xl" w={900}>
                <PageHeader>
                    <PageBreadcrumbsWrapper>
                        {/*test purposes only! will remove before merging*/}
                        <PageBreadcrumbs items={breadCrumbsItems}>
                            All spaces
                        </PageBreadcrumbs>
                        <Breadcrumbs2
                            items={[
                                {
                                    href: '/home',
                                    text: 'Home',
                                    className: 'home-breadcrumb',
                                    onClick: () => history.push('/home'),
                                },
                                {
                                    text: 'All spaces',
                                },
                            ]}
                        />
                    </PageBreadcrumbsWrapper>
                </PageHeader>

                <SpaceBrowser projectUuid={projectUuid} />
            </Stack>
        </Page>
    );
};

export default Spaces;
