import { Stack } from '@mantine/core';
import { useState, type FC } from 'react';
import { useParams } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import { CatalogPanel } from '../features/catalog/components';
import { CatalogMetadata } from '../features/catalog/components/CatalogMetadata';
import { CatalogProvider } from '../features/catalog/context/CatalogProvider';

const Catalog: FC = () => {
    const params = useParams<{ projectUuid: string }>();
    const selectedProjectUuid = params.projectUuid;
    const [isSidebarOpen, setSidebarOpen] = useState(false);

    return (
        <CatalogProvider
            projectUuid={selectedProjectUuid}
            isSidebarOpen={isSidebarOpen}
            setSidebarOpen={setSidebarOpen}
        >
            <Page
                withPaddedContent
                withRightSidebar
                isRightSidebarOpen={isSidebarOpen}
                rightSidebar={<CatalogMetadata />}
            >
                <Stack>
                    <CatalogPanel />
                </Stack>
            </Page>
        </CatalogProvider>
    );
};

export default Catalog;
