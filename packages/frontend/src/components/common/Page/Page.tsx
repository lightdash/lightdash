import { Box, createStyles, getDefaultZIndex } from '@mantine/core';
import { FC, ReactNode } from 'react';
import { Helmet } from 'react-helmet';

import { ProjectType } from '@lightdash/common';
import { useActiveProjectUuid } from '../../../hooks/useActiveProject';
import { useProjects } from '../../../hooks/useProjects';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import AboutFooter, { FOOTER_HEIGHT, FOOTER_MARGIN } from '../../AboutFooter';
import { BANNER_HEIGHT, NAVBAR_HEIGHT } from '../../NavBar';
import { PAGE_HEADER_HEIGHT } from './PageHeader';
import Sidebar from './Sidebar';

type StyleProps = {
    withCenteredContent?: boolean;
    withFitContent?: boolean;
    withFixedContent?: boolean;
    withFooter?: boolean;
    withFullHeight?: boolean;
    withHeader?: boolean;
    withNavbar?: boolean;
    withPaddedContent?: boolean;
    withSidebar?: boolean;
    withSidebarFooter?: boolean;
    withMode?: ReactNode;
    hasBanner?: boolean;
};

export const PAGE_CONTENT_WIDTH = 900;
const PAGE_MIN_CONTENT_WIDTH = 600;

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

            ...(params.withSidebar
                ? {
                      display: 'flex',
                      flexDirection: 'row',
                  }
                : {}),
        },

        mode: params.withMode
            ? {
                  position: 'fixed',
                  zIndex: getDefaultZIndex('app'),
                  width: '100%',
                  height: containerHeight,
                  borderWidth: '4px',
                  borderColor: theme.colors.violet[7],
                  borderStyle: 'solid',
                  pointerEvents: 'none',
              }
            : {},

        floatingModeLabel: params.withMode
            ? {
                  position: 'absolute',
                  top: 0,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: theme.colors.violet[7],
                  borderBottomLeftRadius: theme.radius.md,
                  borderBottomRightRadius: theme.radius.md,
                  color: theme.white,
                  paddingLeft: theme.spacing.xs,
                  paddingRight: theme.spacing.xs,
                  paddingTop: theme.spacing.two,
                  paddingBottom: theme.spacing.two,
                  fontSize: theme.fontSizes.xs,
                  zIndex: getDefaultZIndex('app'),
                  pointerEvents: 'unset',
              }
            : {},

        content: {
            paddingTop: theme.spacing.lg,
            paddingBottom: theme.spacing.lg,

            width: '100%',
            minWidth: PAGE_CONTENT_WIDTH,

            ...(params.withSidebar
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
        },
    };
});

type Props = {
    title?: string;
    sidebar?: React.ReactNode;
    isSidebarOpen?: boolean;
    header?: React.ReactNode;
    hasBanner?: boolean;
} & Omit<StyleProps, 'withSidebar' | 'withHeader'>;

const Page: FC<React.PropsWithChildren<Props>> = ({
    title,
    header,
    sidebar,
    isSidebarOpen = true,

    withCenteredContent = false,
    withFitContent = false,
    withFixedContent = false,
    withFooter = false,
    withFullHeight = false,
    withNavbar = true,
    withPaddedContent = false,
    withSidebarFooter = false,
    withMode = undefined,
    hasBanner = false,

    children,
}) => {
    const { activeProjectUuid } = useActiveProjectUuid({
        refetchOnMount: true,
    });
    const { data: projects } = useProjects();
    const isCurrentProjectPreview = !!projects?.find(
        (project) =>
            project.projectUuid === activeProjectUuid &&
            project.type === ProjectType.PREVIEW,
    );

    hasBanner = hasBanner || isCurrentProjectPreview;

    const { classes } = usePageStyles(
        {
            withCenteredContent,
            withFitContent,
            withFixedContent,
            withFooter,
            withFullHeight,
            withHeader: !!header,
            withNavbar,
            withPaddedContent,
            withSidebar: !!sidebar,
            withSidebarFooter,
            withMode: withMode,
            hasBanner,
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
                    <Sidebar isOpen={isSidebarOpen}>
                        {sidebar}
                        {withSidebarFooter ? <AboutFooter minimal /> : null}
                    </Sidebar>
                ) : null}

                <Box className={classes.content}>
                    <TrackSection name={SectionName.PAGE_CONTENT}>
                        {children}
                    </TrackSection>
                </Box>

                {withFooter && !withSidebarFooter ? <AboutFooter /> : null}

                {withMode && (
                    <Box className={classes.mode}>
                        <Box className={classes.floatingModeLabel}>
                            {withMode}
                        </Box>
                    </Box>
                )}
            </Box>
        </>
    );
};

export default Page;
