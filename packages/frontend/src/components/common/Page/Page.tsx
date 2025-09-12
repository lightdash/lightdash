import { ProjectType } from '@lightdash/common';
import { Box } from '@mantine-8/core';
import { useDisclosure, useElementSize } from '@mantine-8/hooks';
import clsx from 'clsx';
import { type FC } from 'react';
import ErrorBoundary from '../../../features/errorBoundary/ErrorBoundary';
import { useActiveProjectUuid } from '../../../hooks/useActiveProject';
import { useProjects } from '../../../hooks/useProjects';
import { TrackSection } from '../../../providers/Tracking/TrackingProvider';
import { SectionName } from '../../../types/Events';
import AboutFooter from '../../AboutFooter';
import Sidebar from './Sidebar';
import {
    BANNER_HEIGHT,
    FOOTER_HEIGHT,
    FOOTER_MARGIN,
    NAVBAR_HEIGHT,
    PAGE_CONTENT_MAX_WIDTH_LARGE,
    PAGE_CONTENT_WIDTH,
    PAGE_HEADER_HEIGHT,
    PAGE_MIN_CONTENT_WIDTH,
} from './constants';
import classes from './Page.module.css';
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
    backgroundColor?: string;
};

const getContainerHeight = (withNavbar: boolean, withHeader: boolean, hasBanner: boolean) => {
    let containerHeight = '100vh';
    if (withNavbar) {
        containerHeight = `calc(${containerHeight} - ${NAVBAR_HEIGHT}px)`;
    }
    if (withHeader) {
        containerHeight = `calc(${containerHeight} - ${PAGE_HEADER_HEIGHT}px)`;
    }
    if (hasBanner) {
        containerHeight = `calc(${containerHeight} - ${BANNER_HEIGHT}px)`;
    }
    return containerHeight;
};

type Props = {
    title?: string;
    sidebar?: React.ReactNode;
    isSidebarOpen?: boolean;
    rightSidebar?: React.ReactNode;
    isRightSidebarOpen?: boolean;
    rightSidebarWidthProps?: SidebarWidthProps;
    header?: React.ReactNode;
} & Omit<StyleProps, 'withSidebar' | 'withHeader'>;

const Page: FC<React.PropsWithChildren<Props>> = ({
    title,
    header,
    sidebar,
    isSidebarOpen = true,
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
    backgroundColor,
    children,
}) => {
    const { ref: mainRef, width: mainWidth } = useElementSize();
    const [
        isSidebarResizing,
        { open: startSidebarResizing, close: stopSidebarResizing },
    ] = useDisclosure(false);
    const { activeProjectUuid } = useActiveProjectUuid({
        refetchOnMount: true,
    });
    const { data: projects } = useProjects();
    const isCurrentProjectPreview = !!projects?.find(
        (project) =>
            project.projectUuid === activeProjectUuid &&
            project.type === ProjectType.PREVIEW,
    );

    const containerHeight = getContainerHeight(
        withNavbar,
        !!header,
        isCurrentProjectPreview
    );

    const rootClassName = clsx(
        classes.root,
        withFullHeight ? classes.rootFullHeight : null,
        (sidebar || rightSidebar) ? classes.rootWithSidebar : null,
        isSidebarResizing ? classes.rootResizing : null,
        withCenteredRoot ? classes.rootCentered : null
    );

    const contentClassName = clsx(
        classes.content,
        flexContent ? classes.contentFlex : null,
        noContentPadding ? classes.contentNoPadding : null,
        (sidebar || rightSidebar) ? classes.contentWithSidebar : null,
        withFullHeight ? classes.contentFullHeight : null,
        withFitContent ? classes.contentFit : null,
        withLargeContent ? classes.contentLarge : null,
        withPaddedContent ? classes.contentPadded : null,
        withXLargePaddedContent ? classes.contentXLargePadded : null,
        withCenteredContent ? classes.contentCentered : null,
        withSidebarBorder ? classes.contentWithBorder : null
    );

    const rootStyle = {
        height: containerHeight,
        maxHeight: withFullHeight ? containerHeight : undefined,
        backgroundColor: backgroundColor || undefined
    };

    const contentStyle = withFooter ? {
        minHeight: `calc(100% - ${FOOTER_HEIGHT}px - var(--mantine-spacing-${FOOTER_MARGIN}) - 1px)`
    } : {};

    return (
        <>
            {title ? <title>{`${title} - Lightdash`}</title> : null}

            {header}

            <Box id="page-root" className={rootClassName} style={rootStyle}>
                {sidebar ? (
                    <Sidebar
                        noSidebarPadding={noSidebarPadding}
                        isOpen={isSidebarOpen}
                        onResizeStart={startSidebarResizing}
                        onResizeEnd={stopSidebarResizing}
                    >
                        <ErrorBoundary wrapper={{ mt: '4xl' }}>
                            {sidebar}
                        </ErrorBoundary>
                        {withSidebarFooter ? <AboutFooter minimal /> : null}
                    </Sidebar>
                ) : null}

                <main className={contentClassName} style={contentStyle} ref={mainRef}>
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
