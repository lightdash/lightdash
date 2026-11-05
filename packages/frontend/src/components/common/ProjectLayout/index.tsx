import { Box, VisuallyHidden } from '@mantine/core';
import * as Sentry from '@sentry/react';
import { type FC } from 'react';
import { Outlet, useLocation, useMatches, useNavigation } from 'react-router';
import ScopeTourHost from '../../../features/scopeTours/ScopeTourHost';
import NavBar from '../../NavBar';
import PageSpinner from '../../PageSpinner';
import { ContentAuthoringRoute } from './ContentAuthoringRoute';
import classes from './ProjectLayout.module.css';

/**
 * Layout component for all /projects/:projectUuid/* routes.
 *
 * Renders NavBar above the page outlet.
 *
 * Searches all matching routes for `handle.navBarFixed` to determine
 * whether NavBar should be fixed (default) or non-fixed (e.g. dashboard views).
 * The handle can be on any route in the hierarchy, not just the deepest child.
 */
const ProjectLayout: FC = () => {
    const matches = useMatches();
    const location = useLocation();
    const navigation = useNavigation();
    const isNavigating =
        navigation.state === 'loading' &&
        navigation.location.pathname !== location.pathname;
    // Search all matches for navBarFixed (handle may be on parent route)
    const isNavBarFixed = !matches.some((match) => {
        const handle = match.handle as { navBarFixed?: boolean } | undefined;
        return handle?.navBarFixed === false;
    });

    return (
        <>
            <NavBar isFixed={isNavBarFixed || isNavigating} />
            <Sentry.ErrorBoundary fallback={<></>}>
                <ScopeTourHost />
            </Sentry.ErrorBoundary>
            {/* Keep the current page mounted so cancelled navigation preserves edits. */}
            <Box display="contents" inert={isNavigating}>
                <ContentAuthoringRoute>
                    <Outlet />
                </ContentAuthoringRoute>
            </Box>
            {isNavigating && (
                <Box className={classes.loading} role="status">
                    <VisuallyHidden>Loading page</VisuallyHidden>
                    <PageSpinner />
                </Box>
            )}
        </>
    );
};

export default ProjectLayout;
