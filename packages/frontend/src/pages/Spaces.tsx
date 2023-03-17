import { subject } from '@casl/ability';
import { Stack } from '@mantine/core';
import { FC } from 'react';
import { Helmet } from 'react-helmet';
import { useParams } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import { PageHeader } from '../components/common/Page/Page.styles';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import SpaceBrowser from '../components/Explorer/SpaceBrowser';
import ForbiddenPanel from '../components/ForbiddenPanel';
import { useApp } from '../providers/AppProvider';

const Spaces: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { user } = useApp();

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

    return (
        <Page>
            <Helmet>
                <title>Spaces - Lightdash</title>
            </Helmet>

            <Stack spacing="xl" w={900}>
                <PageHeader>
                    <PageBreadcrumbs
                        items={[{ href: '/home', title: 'Home' }]}
                        mt="xs"
                    >
                        All Spaces
                    </PageBreadcrumbs>
                </PageHeader>
                <SpaceBrowser projectUuid={projectUuid} />
            </Stack>
        </Page>
    );
};

export default Spaces;
