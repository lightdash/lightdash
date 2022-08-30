import React, { memo } from 'react';
import Explorer from '../components/Explorer';
import ExploreSideBar from '../components/Explorer/ExploreSideBar/index';
import ForbiddenPanel from '../components/ForbiddenPanel';
import {
    useExplorerRoute,
    useExplorerUrlState,
} from '../hooks/useExplorerRoute';
import useSidebarResize from '../hooks/useSidebarResize';
import { useApp } from '../providers/AppProvider';
import { ExplorerProvider } from '../providers/ExplorerProvider';
import {
    Main,
    PageContainer,
    Resizer,
    SideBar,
    SideBarCard,
} from './Explorer.styles';

const ExplorerWithUrlParams = memo(() => {
    useExplorerRoute();
    return <Explorer />;
});

const ExplorerPage = memo(() => {
    const explorerUrlState = useExplorerUrlState();
    const { sidebarRef, sidebarWidth, isResizing, startResizing } =
        useSidebarResize({
            defaultWidth: 400,
            minWidth: 300,
            maxWidth: 600,
        });
    const { user } = useApp();
    if (user.data?.ability?.cannot('view', 'Project')) {
        return <ForbiddenPanel />;
    }
    return (
        <ExplorerProvider isEditMode={true} initialState={explorerUrlState}>
            <PageContainer>
                <SideBar ref={sidebarRef}>
                    <SideBarCard
                        elevation={1}
                        style={{
                            width: sidebarWidth,
                        }}
                    >
                        <ExploreSideBar />
                    </SideBarCard>
                    <Resizer
                        onMouseDown={startResizing}
                        $isResizing={isResizing}
                    />
                </SideBar>
                <Main>
                    <ExplorerWithUrlParams />
                </Main>
            </PageContainer>
        </ExplorerProvider>
    );
});

export default ExplorerPage;
