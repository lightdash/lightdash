import { Box } from '@mantine/core';
import { useEffect, useState, type FC } from 'react';
import { useParams } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import { NavBarPOC } from '../components/NavBar/NavBarPOC';
import { CatalogPanel } from '../features/catalog/components';
import { CatalogMetadata } from '../features/catalog/components/CatalogMetadata';
import {
    CatalogProvider,
    useCatalogContext,
} from '../features/catalog/context/CatalogProvider';
import { useExplorerUrlState } from '../hooks/useExplorerRoute';
import Explorer from './Explorer';

const ExploreModal: FC<{ projectUuid: string }> = () => {
    const { isViewingCatalog, explorerUrlState, setIsViewingCatalog } =
        useCatalogContext();

    const explorerUrlStateFromHook = useExplorerUrlState();

    useEffect(() => {
        if (explorerUrlState || explorerUrlStateFromHook) {
            setIsViewingCatalog(false);
        }
    }, [explorerUrlState, explorerUrlStateFromHook, setIsViewingCatalog]);

    return (
        <Box
            sx={{
                display: isViewingCatalog ? 'none' : 'block',
            }}
        >
            <Explorer explorerUrlState={explorerUrlState} />
        </Box>
    );
};

const CatalogPage: FC<{ isSidebarOpen: boolean }> = ({ isSidebarOpen }) => {
    const { isViewingCatalog } = useCatalogContext();

    return (
        <Box
            sx={{
                display: !isViewingCatalog ? 'none' : 'block',
            }}
        >
            <Page
                withFitContent
                withPaddedContent
                withRightSidebar
                isRightSidebarOpen={isSidebarOpen}
                rightSidebar={<CatalogMetadata />}
                rightSidebarWidthProps={{
                    defaultWidth: 600,
                    minWidth: 600,
                    maxWidth: 800,
                }}
            >
                <Box
                    sx={
                        isSidebarOpen
                            ? {
                                  overflowY: 'scroll',
                                  maxHeight: 'calc(100vh - 100px)',
                              }
                            : {}
                    }
                >
                    <CatalogPanel />
                </Box>
            </Page>
        </Box>
    );
};

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
            <NavBarPOC />

            <CatalogPage isSidebarOpen={isSidebarOpen} />
            <ExploreModal projectUuid={selectedProjectUuid} />
        </CatalogProvider>
    );
};

export default Catalog;
