import { Box, createStyles } from '@mantine/core';
import { FC } from 'react';
import { Helmet } from 'react-helmet';

import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import AboutFooter from '../../AboutFooter';
import { NAVBAR_HEIGHT } from '../../NavBar';
import { PAGE_HEADER_HEIGHT } from './PageHeader';
import Sidebar from './Sidebar';

type StyleProps = {
    withFixedContent?: boolean;
    withFooter?: boolean;
    withFullHeight?: boolean;
    withHeader?: boolean;
    withNavbar?: boolean;
    withSidebar?: boolean;
    withSidebarFooter?: boolean;
    withPaddedContent?: boolean;
    withCenteredContent?: boolean;
};

const usePageStyles = createStyles<string, StyleProps>((theme, params) => {
    let containerHeight = '100vh';

    if (params.withNavbar) {
        containerHeight = `calc(${containerHeight} - ${NAVBAR_HEIGHT}px)`;
    }
    if (params.withHeader) {
        containerHeight = `calc(${containerHeight} - ${PAGE_HEADER_HEIGHT}px)`;
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

                      overflowY: 'scroll',
                      overscrollBehavior: 'contain',
                      WebkitOverflowScrolling: 'touch',
                  }),

            ...(params.withSidebar
                ? {
                      display: 'flex',
                      flexDirection: 'row',
                  }
                : {}),
        },

        content: {
            paddingTop: theme.spacing.xl,
            paddingBottom: theme.spacing.xl,

            width: '100%',

            ...(params.withFullHeight
                ? {
                      flexGrow: 1,
                      height: '100%',
                      maxHeight: '100%',

                      overflowY: 'scroll',
                      overscrollBehavior: 'contain',
                      WebkitOverflowScrolling: 'touch',
                  }
                : {}),

            ...(params.withFixedContent
                ? {
                      marginLeft: 'auto',
                      marginRight: 'auto',

                      width: 900,
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
} & Omit<StyleProps, 'withSidebar' | 'withHeader'>;

const Page: FC<Props> = ({
    title,
    header,
    sidebar,
    isSidebarOpen = true,

    withSidebarFooter = false,
    withNavbar = true,
    withFixedContent = false,
    withFullHeight = false,
    withFooter = false,
    withPaddedContent = false,
    withCenteredContent = false,

    children,
}) => {
    const { classes } = usePageStyles(
        {
            withFixedContent,
            withFooter,
            withFullHeight: withFullHeight || withPaddedContent,
            withHeader: !!header,
            withNavbar,
            withSidebar: !!sidebar,
            withSidebarFooter,
            withPaddedContent,
            withCenteredContent,
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
            </Box>
        </>
    );
};

export default Page;
