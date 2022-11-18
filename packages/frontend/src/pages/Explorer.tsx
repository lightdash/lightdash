import { Card } from '@blueprintjs/core';
import { memo } from 'react';
import {
    CardContent,
    PageContentContainer,
    PageWrapper,
    Resizer,
    StickySidebar,
} from '../components/common/Page/Page.styles';
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
            <PageWrapper>
                <StickySidebar
                    ref={sidebarRef}
                    style={{
                        width: sidebarWidth + 5,
                    }}
                >
                    <Card
                        elevation={1}
                        style={{
                            width: sidebarWidth,
                        }}
                    >
                        <CardContent>
                            <ExploreSideBar />
                        </CardContent>
                    </Card>

                    <Resizer
                        onMouseDown={startResizing}
                        $isResizing={isResizing}
                    />
                </StickySidebar>

                <PageContentContainer hasDraggableSidebar>
                    <ExplorerWithUrlParams />
                </PageContentContainer>
            </PageWrapper>
        </ExplorerProvider>
    );
});

export default ExplorerPage;
