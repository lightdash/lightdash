import { ProjectType, type AnyType } from '@lightdash/common';
import { Box, Button, Drawer, useMatches } from '@mantine/core';
import { useDisclosure, useElementSize } from '@mantine/hooks';
import { IconLayoutSidebarLeftExpand } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
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
    // Size to the parent container instead of the viewport. Use when the page
    // renders inside a modal or another host that is not viewport-height.
    withContainerHeight?: boolean;
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
    sidebarTitle?: string;
    isSidebarOpen?: boolean;
    isSidebarCollapsed?: boolean;
    isSidebarCollapsible?: boolean;
    collapsedSidebarContent?: React.ReactNode;
    sidebarWidthProps?: SidebarWidthProps;
    rightSidebar?: React.ReactNode;
    rightSidebarTitle?: string;
    onRightSidebarClose?: () => void;
    isRightSidebarOpen?: boolean;
    keepRightSidebarMounted?: boolean;
    noRightSidebarPadding?: boolean;
    rightSidebarWidthProps?: SidebarWidthProps;
    header?: React.ReactNode;
} & Omit<StyleProps, 'withSidebar' | 'withHeader' | 'hasBanner'>;

const Page: FC<React.PropsWithChildren<Props>> = ({
    title,
    header,
    sidebar,
    sidebarTitle = 'Navigation',
    isSidebarOpen = true,
    isSidebarCollapsed = false,
    isSidebarCollapsible = false,
    collapsedSidebarContent,
    sidebarWidthProps,
    rightSidebar,
    rightSidebarTitle = 'Details',
    onRightSidebarClose,
    isRightSidebarOpen = false,
    keepRightSidebarMounted = false,
    noRightSidebarPadding,
    rightSidebarWidthProps,

    withCenteredContent = false,
    withCenteredRoot = false,
    withFitContent = false,
    withFixedContent = false,
    withLargeContent = false,
    withXLargePaddedContent = false,
    withFooter = false,
    withFullHeight = false,
    withContainerHeight = false,
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
    const getUiString = useUiStrings();
    const compact = useMatches(
        { base: true, md: false },
        { getInitialValueInEffect: false },
    );
    const [sidebarOpened, { open: openSidebar, close: closeSidebar }] =
        useDisclosure(false);
    useEffect(closeSidebar, [compact, closeSidebar]);
    const { ref: mainRef, width: mainWidth } = useElementSize();
    const { ref: headerRef, height: headerHeight } = useElementSize();
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

    const withSidebar = !compact && (!!sidebar || !!rightSidebar);
    const reserveSidebarToggle =
        !compact && isSidebarCollapsible && isSidebarCollapsed;

    return (
        <>
            <DocumentTitle title={title} />

            {header && <Box ref={headerRef}>{header}</Box>}

            <Box
                id="page-root"
                className={classes.root}
                data-with-navbar={withNavbar}
                data-with-header={!!header}
                data-has-banner={hasBanner}
                data-full-page-scroll={fullPageScroll}
                data-full-height={withFullHeight}
                data-container-height={withContainerHeight}
                data-with-sidebar={withSidebar}
                data-sidebar-resizing={isSidebarResizing}
                data-centered-root={withCenteredRoot}
                data-compact={compact}
                style={
                    header
                        ? { '--header-offset': `${headerHeight}px` }
                        : undefined
                }
            >
                {sidebar && compact && isSidebarOpen ? (
                    <Box px="sm" py="xs" className={classes.sidebarToolbar}>
                        <Button
                            variant="default"
                            onClick={openSidebar}
                            leftSection={
                                <IconLayoutSidebarLeftExpand size={18} />
                            }
                            aria-expanded={sidebarOpened}
                        >
                            {sidebarTitle}
                        </Button>
                        <Drawer
                            opened={sidebarOpened}
                            onClose={closeSidebar}
                            title={sidebarTitle}
                            closeButtonProps={{
                                'aria-label': getUiString('page.closeSidebar'),
                            }}
                            size="min(100%, 24rem)"
                            onClickCapture={(event) => {
                                if (
                                    event.target instanceof Element &&
                                    event.target.closest('a[href]')
                                )
                                    closeSidebar();
                            }}
                        >
                            <ErrorBoundary>{sidebar}</ErrorBoundary>
                            {withSidebarFooter ? <AboutFooter minimal /> : null}
                        </Drawer>
                    </Box>
                ) : sidebar && !compact ? (
                    <Sidebar
                        noSidebarPadding={noSidebarPadding}
                        isOpen={isSidebarOpen}
                        isCollapsed={isSidebarCollapsed}
                        collapsible={isSidebarCollapsible}
                        collapsedContent={collapsedSidebarContent}
                        widthProps={sidebarWidthProps}
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

                {rightSidebar && compact && onRightSidebarClose ? (
                    <Drawer
                        opened={isRightSidebarOpen}
                        onClose={onRightSidebarClose}
                        title={rightSidebarTitle}
                        closeButtonProps={{
                            'aria-label': getUiString('page.closeDetails'),
                        }}
                        position="right"
                        size="100%"
                        keepMounted={keepRightSidebarMounted}
                        padding="md"
                        styles={
                            noRightSidebarPadding
                                ? { body: { padding: 0 } }
                                : undefined
                        }
                    >
                        <ErrorBoundary>{rightSidebar}</ErrorBoundary>
                    </Drawer>
                ) : rightSidebar ? (
                    <Sidebar
                        noSidebarPadding={
                            noRightSidebarPadding ?? noSidebarPadding
                        }
                        widthProps={rightSidebarWidthProps}
                        mainWidth={mainWidth}
                        isOpen={isRightSidebarOpen}
                        keepMounted={keepRightSidebarMounted}
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
