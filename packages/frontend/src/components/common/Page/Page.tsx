import { ProjectType, type AnyType } from '@lightdash/common';
import { Box } from '@mantine-8/core';
import { useDisclosure, useElementSize } from '@mantine-8/hooks';
import { type FC } from 'react';
import ErrorBoundary from '../../../features/errorBoundary/ErrorBoundary';
import { useActiveProjectUuid } from '../../../hooks/useActiveProject';
import { useProject } from '../../../hooks/useProject';
import { useImpersonation } from '../../../hooks/user/useImpersonation';
import { TrackSection } from '../../../providers/Tracking/TrackingProvider';
import { SectionName } from '../../../types/Events';
import AboutFooter from '../../AboutFooter';
import { DocumentTitle } from '../DocumentTitle';
import classes from './Page.module.css';
import Sidebar from './Sidebar';
import { SidebarPosition, type SidebarWidthProps } from './types';

type StyleProps = {
    withCenteredContent?: boolean;
    withCenteredRoot?: boolean;
    withFitContent?: boolean;
    withLargeContent?: boolean;
    withXLargePaddedContent?: boolean;
    withFixedContent?: boolean;
    withFooter?: boolean;
    withFullHeight?: boolean;
    withHeader?: boolean;
    withNavbar?: boolean;
    withPaddedContent?: boolean;
    withSidebar?: boolean;
    withSidebarFooter?: boolean;
    withRightSidebar?: boolean;
    withSidebarBorder?: boolean;
    flexContent?: boolean;
    hasBanner?: boolean;
    noContentPadding?: boolean;
    noSidebarPadding?: boolean;
    isSidebarResizing?: boolean;
    reserveSidebarToggle?: boolean;
    fullPageScroll?: boolean;
};

type Props = {
    title?: string;
    sidebar?: React.ReactNode;
    isSidebarOpen?: boolean;
    isSidebarCollapsed?: boolean;
    isSidebarCollapsible?: boolean;
    collapsedSidebarContent?: React.ReactNode;
    rightSidebar?: React.ReactNode;
    isRightSidebarOpen?: boolean;
    rightSidebarWidthProps?: SidebarWidthProps;
    header?: React.ReactNode;
} & Omit<StyleProps, 'withSidebar' | 'withHeader' | 'hasBanner'>;

const Page: FC<React.PropsWithChildren<Props>> = ({
    title,
    header,
    sidebar,
    isSidebarOpen = true,
    isSidebarCollapsed = false,
    isSidebarCollapsible = false,
    collapsedSidebarContent,
    rightSidebar,
    isRightSidebarOpen = false,
    rightSidebarWidthProps,

    withCenteredContent = false,
    withCenteredRoot = false,
    withFitContent = false,
    withFixedContent = false,
    withLargeContent = false,
    withXLargePaddedContent = false,
    withFooter = false,
    withFullHeight = false,
    withNavbar = true,
    withPaddedContent = false,
    withSidebarFooter = false,
    withSidebarBorder = false,
    noContentPadding = false,
    noSidebarPadding = false,
    flexContent = false,
    fullPageScroll = false,
    children,
}) => {
    const { ref: mainRef, width: mainWidth } = useElementSize();
    const [
        isSidebarResizing,
        { open: startSidebarResizing, close: stopSidebarResizing },
    ] = useDisclosure(false);

    const { activeProjectUuid } = useActiveProjectUuid({
        refetchOnMount: true,
        enabled: withNavbar,
    } as AnyType);
    const { data: project } = useProject(activeProjectUuid);

    const isCurrentProjectPreview = project?.type === ProjectType.PREVIEW;
    const { isImpersonating } = useImpersonation();
    const hasBanner = isCurrentProjectPreview || isImpersonating;

    const withSidebar = !!sidebar || !!rightSidebar;
    const reserveSidebarToggle = isSidebarCollapsible && isSidebarCollapsed;

    return (
        <>
            <DocumentTitle title={title} />

            {header}

            <Box
                id="page-root"
                className={classes.root}
                data-with-navbar={withNavbar}
                data-with-header={!!header}
                data-has-banner={hasBanner}
                data-full-page-scroll={fullPageScroll}
                data-full-height={withFullHeight}
                data-with-sidebar={withSidebar}
                data-sidebar-resizing={isSidebarResizing}
                data-centered-root={withCenteredRoot}
            >
                {sidebar ? (
                    <Sidebar
                        noSidebarPadding={noSidebarPadding}
                        isOpen={isSidebarOpen}
                        isCollapsed={isSidebarCollapsed}
                        collapsible={isSidebarCollapsible}
                        collapsedContent={collapsedSidebarContent}
                        onResizeStart={startSidebarResizing}
                        onResizeEnd={stopSidebarResizing}
                    >
                        <ErrorBoundary wrapper={{ mt: '4xl' }}>
                            {sidebar}
                        </ErrorBoundary>
                        {withSidebarFooter ? <AboutFooter minimal /> : null}
                    </Sidebar>
                ) : null}

                <main
                    className={classes.content}
                    ref={mainRef}
                    data-flex-content={flexContent}
                    data-no-content-padding={noContentPadding}
                    data-with-sidebar={withSidebar}
                    data-with-footer={withFooter}
                    data-full-height={withFullHeight}
                    data-full-page-scroll={fullPageScroll}
                    data-fit-content={withFitContent}
                    data-large-content={withLargeContent}
                    data-padded-content={withPaddedContent}
                    data-reserve-sidebar-toggle={reserveSidebarToggle}
                    data-xlarge-padded-content={withXLargePaddedContent}
                    data-centered-content={withCenteredContent}
                    data-sidebar-border={withSidebarBorder}
                >
                    <TrackSection name={SectionName.PAGE_CONTENT}>
                        <ErrorBoundary wrapper={{ mt: '4xl' }}>
                            {withFixedContent ? (
                                <div className={classes.fixedContainer}>
                                    {children}
                                </div>
                            ) : (
                                children
                            )}
                        </ErrorBoundary>
                    </TrackSection>
                </main>

                {rightSidebar ? (
                    <Sidebar
                        noSidebarPadding={noSidebarPadding}
                        widthProps={rightSidebarWidthProps}
                        mainWidth={mainWidth}
                        isOpen={isRightSidebarOpen}
                        position={SidebarPosition.RIGHT}
                        onResizeStart={startSidebarResizing}
                        onResizeEnd={stopSidebarResizing}
                    >
                        <ErrorBoundary wrapper={{ mt: '4xl' }}>
                            {rightSidebar}
                        </ErrorBoundary>
                    </Sidebar>
                ) : null}

                {withFooter && !withSidebarFooter ? <AboutFooter /> : null}
            </Box>
        </>
    );
};

export default Page;
