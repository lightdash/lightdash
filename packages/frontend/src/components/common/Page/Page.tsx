import { Box, createStyles } from '@mantine/core';
import { FC } from 'react';
import { Helmet } from 'react-helmet';

import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import AboutFooter from '../../AboutFooter';
import { NAVBAR_HEIGHT } from '../../NavBar';
import { PAGE_HEADER_HEIGHT } from '../PageHeader';
import Sidebar from './Sidebar';

type StyleProps = {
    withCenteredContent?: boolean;
    withFooter?: boolean;
    withFullHeight?: boolean;
    withHeader?: boolean;
    withNavbar?: boolean;
    withSidebar?: boolean;
    withSidebarFooter?: boolean;
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
                      overflowY: 'scroll',
                      height: containerHeight,
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

                      paddingLeft: theme.spacing.lg,
                      paddingRight: theme.spacing.lg,

                      overflowY: 'scroll',
                  }
                : {}),

            ...(params.withCenteredContent
                ? {
                      marginLeft: 'auto',
                      marginRight: 'auto',
                      width: 900,
                  }
                : {}),
        },
    };
});

type Props = {
    title?: string;
    sidebar?: React.ReactNode;
    header?: React.ReactNode;
} & Omit<StyleProps, 'withSidebar' | 'withHeader'>;

const Page: FC<Props> = ({
    title,
    header,
    sidebar,

    withSidebarFooter = false,
    withNavbar = true,
    withCenteredContent = false,
    withFullHeight = false,
    withFooter = false,

    children,
}) => {
    const { classes } = usePageStyles({
        withCenteredContent,
        withFooter,
        withFullHeight,
        withHeader: !!header,
        withNavbar,
        withSidebar: !!sidebar,
        withSidebarFooter,
    });

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
                    <Sidebar>
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
