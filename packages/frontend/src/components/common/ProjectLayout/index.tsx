import { Box, VisuallyHidden } from '@mantine/core';
import * as Sentry from '@sentry/react';
import { type FC } from 'react';
import { Outlet, useLocation, useMatches, useNavigation } from 'react-router';
import ScopeTourHost from '../../../features/scopeTours/ScopeTourHost';
import SourceCodeDrawer from '../../../features/sourceCodeEditor/components/SourceCodeDrawer';
import NavBar from '../../NavBar';
import PageSpinner from '../../PageSpinner';
import classes from './ProjectLayout.module.css';

/**
 * Layout component for all /projects/:projectUuid/* routes.
 *
 * Renders NavBar and SourceCodeDrawer in the correct order, ensuring
 * the drawer renders after NavBar has mounted (fixing visual glitches).
 *
 * Searches all matching routes for `handle.navBarFixed` to determine
 * whether NavBar should be fixed (default) or non-fixed (e.g. dashboard views).
 * The handle can be on any route in the hierarchy, not just the deepest child.
 *
 * The SourceCodeDrawer is wrapped in an ErrorBoundary with null fallback
 * so that drawer errors don't break the rest of the app.
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
                <SourceCodeDrawer />
            </Sentry.ErrorBoundary>
            <Sentry.ErrorBoundary fallback={<></>}>
                <ScopeTourHost />
            </Sentry.ErrorBoundary>
            {/* Keep the current page mounted so cancelled navigation preserves edits. */}
            <Box display="contents" inert={isNavigating}>
                <Outlet />
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
