import { Box, createStyles } from '@mantine/core';
import { type FC } from 'react';
import { Helmet } from 'react-helmet';

import { ProjectType } from '@lightdash/common';
import { useDisclosure, useElementSize } from '@mantine/hooks';
import { ErrorBoundary } from '../../../features/errorBoundary';
import { useActiveProjectUuid } from '../../../hooks/useActiveProject';
import { useProjects } from '../../../hooks/useProjects';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import AboutFooter, { FOOTER_HEIGHT, FOOTER_MARGIN } from '../../AboutFooter';
import { BANNER_HEIGHT, NAVBAR_HEIGHT } from '../../NavBar';
import { PAGE_HEADER_HEIGHT } from './PageHeader';
import Sidebar, {
    SidebarPosition,
    type SidebarProps,
    type SidebarWidthProps,
} from './Sidebar';

type StyleProps = {
    withCenteredContent?: boolean;
    withFitContent?: boolean;
    withLargeContent?: boolean;
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
    isSidebarResizing?: boolean;
};

export const PAGE_CONTENT_WIDTH = 900;
const PAGE_CONTENT_WIDTH_LARGE = 1200;
export const PAGE_MIN_CONTENT_WIDTH = 600;

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

            ...(params.withFixedContent
                ? {
                      marginLeft: 'auto',
                      marginRight: 'auto',

                      width: PAGE_CONTENT_WIDTH,
                      flexShrink: 0,
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
                      width: PAGE_CONTENT_WIDTH_LARGE,
                  }
                : {}),

            ...(params.withPaddedContent
                ? {
                      paddingLeft: theme.spacing.lg,
                      paddingRight: theme.spacing.lg,
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
                      borderLeft: `1px solid ${theme.colors.gray[3]}`,
                  }
                : {}),
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
    sidebarProps?: SidebarProps;
} & Omit<StyleProps, 'withSidebar' | 'withHeader'>;

const Page: FC<React.PropsWithChildren<Props>> = ({
    title,
    header,
    sidebar,
    sidebarProps,
    isSidebarOpen = true,
    rightSidebar,
    isRightSidebarOpen = false,
    rightSidebarWidthProps,

    withCenteredContent = false,
    withFitContent = false,
    withFixedContent = false,
    withLargeContent = false,
    withFooter = false,
    withFullHeight = false,
    withNavbar = true,
    withPaddedContent = false,
    withSidebarFooter = false,
    withSidebarBorder = false,
    noContentPadding = false,
    flexContent = false,

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

    const { classes } = usePageStyles(
        {
            withCenteredContent,
            withFitContent,
            withFixedContent,
            withLargeContent,
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
        },
        { name: 'Page' },
    );

    return (
        <>
            {title ? (
                <Helmet>
                    <title>{title} - Lightdash</title>
                </Helmet>
            ) : null}

            {header}

            <Box className={classes.root}>
                {sidebar ? (
                    <Sidebar
                        isOpen={isSidebarOpen}
                        onResizeStart={startSidebarResizing}
                        onResizeEnd={stopSidebarResizing}
                        sidebarProps={sidebarProps}
                    >
                        <ErrorBoundary wrapper={{ mt: '4xl' }}>
                            {sidebar}
                        </ErrorBoundary>
                        {withSidebarFooter ? <AboutFooter minimal /> : null}
                    </Sidebar>
                ) : null}

                <Box component="main" className={classes.content} ref={mainRef}>
                    <TrackSection name={SectionName.PAGE_CONTENT}>
                        <ErrorBoundary wrapper={{ mt: '4xl' }}>
                            {children}
                        </ErrorBoundary>
                    </TrackSection>
                </Box>

                {rightSidebar ? (
                    <Sidebar
                        isOpen={isRightSidebarOpen}
                        position={SidebarPosition.RIGHT}
                        widthProps={rightSidebarWidthProps}
                        mainWidth={mainWidth}
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
