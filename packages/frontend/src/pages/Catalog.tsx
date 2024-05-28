import { useState } from 'react';
import { useParams } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import { CatalogPanel } from '../features/catalog/components';
import { CatalogMetadata } from '../features/catalog/components/CatalogMetadata';
import { CatalogProvider } from '../features/catalog/providers';

const Catalog = () => {
    const params = useParams<{ projectUuid: string }>();
    const selectedProjectUuid = params.projectUuid;
    const [isSidebarOpen, setSidebarOpen] = useState(false);

    return (
        <CatalogProvider
            isSidebarOpen={isSidebarOpen}
            setSidebarOpen={setSidebarOpen}
        >
            <Page
                lockScroll={isSidebarOpen}
                withPaddedContent
                withFooter
                withRightSidebar
                isRightSidebarOpen={isSidebarOpen}
                rightSidebar={<CatalogMetadata />}
                rightSidebarWidthProps={{
                    defaultWidth: 600,
                    minWidth: 600,
                    maxWidth: 800,
                }}
            >
                <CatalogPanel projectUuid={selectedProjectUuid} />
            </Page>
        </CatalogProvider>
    );
};

export default Catalog;
