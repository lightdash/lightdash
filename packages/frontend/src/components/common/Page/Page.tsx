import { ProjectType, type AnyType } from '@lightdash/common';
import { Box, createStyles } from '@mantine/core';
import { useDisclosure, useElementSize } from '@mantine/hooks';
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

const usePageStyles = createStyles<string, StyleProps>((theme, params) => {
    let containerHeight = '100vh';

    if (params.withNavbar) {
        containerHeight = `calc(${containerHeight} - ${NAVBAR_HEIGHT}px)`;
    }
    if (params.withHeader) {
        containerHeight = `calc(${containerHeight} - ${PAGE_HEADER_HEIGHT}px)`;
    }
    if (params.hasBanner) {
        containerHeight = `calc(${containerHeight} - ${BANNER_HEIGHT}px)`;
    }
    return {
        root: {
            ...(params.withFullHeight
                ? {
                      height: containerHeight,
                      maxHeight: containerHeight,
                  }
                : {
                      height: containerHeight,

                      overflowY: 'auto',
                  }),

            ...(params.withSidebar || params.withRightSidebar
                ? {
                      display: 'flex',
                      flexDirection: 'row',
                  }
                : {}),

            ...(params.isSidebarResizing
                ? {
                      userSelect: 'none',
                  }
                : {}),

            ...(params.withCenteredRoot
                ? {
                      display: 'flex',
                      justifyContent: 'center',
                  }
                : {}),

            ...(params.backgroundColor
                ? {
                      backgroundColor: params.backgroundColor,
                  }
                : {}),
        },

        content: {
            width: '100%',
            minWidth: PAGE_CONTENT_WIDTH,

            ...(params.flexContent ? { display: 'flex' } : {}),
            ...(params.noContentPadding
                ? {
                      padding: 0,
                  }
                : {
                      paddingTop: theme.spacing.lg,
                      paddingBottom: theme.spacing.lg,
                  }),

            ...(params.withSidebar || params.withRightSidebar
                ? {
                      minWidth: PAGE_MIN_CONTENT_WIDTH,
                  }
                : {}),

            ...(params.withFooter
                ? {
                      minHeight: `calc(100% - ${FOOTER_HEIGHT}px - ${theme.spacing[FOOTER_MARGIN]} - 1px)`,
                  }
                : {}),

            ...(params.withFullHeight
                ? {
                      display: 'flex',
                      flexDirection: 'column',

                      height: '100%',
                      maxHeight: '100%',

                      overflowY: 'auto',
                  }
                : {}),

            ...(params.withFitContent
                ? {
                      width: 'fit-content',
                      marginLeft: 'auto',
                      marginRight: 'auto',
                  }
                : {}),

            ...(params.withLargeContent
                ? {
                      maxWidth: PAGE_CONTENT_MAX_WIDTH_LARGE,
                  }
                : {}),

            ...(params.withPaddedContent
                ? {
                      paddingLeft: theme.spacing.lg,
                      paddingRight: theme.spacing.lg,
                  }
                : {}),

            ...(params.withXLargePaddedContent
                ? {
                      padding: theme.spacing.xxl,
                  }
                : {}),

            ...(params.withCenteredContent
                ? {
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                  }
                : {}),

            ...(params.withSidebarBorder
                ? {
                      borderLeft: `1px solid ${theme.colors.ldGray[3]}`,
                  }
                : {}),
        },

        fixedContainer: {
            marginLeft: 'auto',
            marginRight: 'auto',

            width: PAGE_CONTENT_WIDTH,
            flexShrink: 0,
        },
    };
});

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
        enabled: withNavbar,
    } as AnyType);
    const { data: projects } = useProjects({
        enabled: withNavbar,
    });
    const isCurrentProjectPreview =
        withNavbar &&
        !!projects?.find(
            (project) =>
                project.projectUuid === activeProjectUuid &&
                project.type === ProjectType.PREVIEW,
        );

    const { classes } = usePageStyles(
        {
            withCenteredContent,
            withCenteredRoot,
            withFitContent,
            withFixedContent,
            withLargeContent,
            withXLargePaddedContent,
            withFooter,
            withFullHeight,
            withHeader: !!header,
            withNavbar,
            withPaddedContent,
            withSidebar: !!sidebar,
            withSidebarFooter,
            withSidebarBorder,
            withRightSidebar: !!rightSidebar,
            hasBanner: isCurrentProjectPreview,
            noContentPadding,
            flexContent,
            isSidebarResizing,
            backgroundColor,
        },
        { name: 'Page' },
    );

    return (
        <>
            {title ? <title>{`${title} - Lightdash`}</title> : null}

            {header}

            <Box id="page-root" className={classes.root}>
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

                <main className={classes.content} ref={mainRef}>
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
