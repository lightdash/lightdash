import React from 'react';
import Explorer from '../components/Explorer';
import ExploreSideBar from '../components/Explorer/ExploreSideBar/index';
import {
    useExplorerRoute,
    useExplorerUrlState,
} from '../hooks/useExplorerRoute';
import { ExplorerProvider } from '../providers/ExplorerProvider';
import { Main, PageContainer, SideBar } from './Explorer.styles';

const ExplorerWithUrlParams = () => {
    useExplorerRoute();
    return <Explorer />;
};

const ExplorerPage = () => {
    const explorerUrlState = useExplorerUrlState();
    return (
        <ExplorerProvider isEditMode={true} initialState={explorerUrlState}>
            <PageContainer>
                <SideBar elevation={1}>
                    <ExploreSideBar />
                </SideBar>
                <Main>
                    <ExplorerWithUrlParams />
                </Main>
            </PageContainer>
        </ExplorerProvider>
    );
};

export default ExplorerPage;
