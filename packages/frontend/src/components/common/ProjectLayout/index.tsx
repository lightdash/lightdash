import * as Sentry from '@sentry/react';
import { type FC } from 'react';
import { Outlet, useMatches } from 'react-router';
import SourceCodeDrawer from '../../../features/sourceCodeEditor/components/SourceCodeDrawer';
import NavBar from '../../NavBar';

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
    // Search all matches for navBarFixed (handle may be on parent route)
    const isNavBarFixed = !matches.some((match) => {
        const handle = match.handle as { navBarFixed?: boolean } | undefined;
        return handle?.navBarFixed === false;
    });

    return (
        <>
            <NavBar isFixed={isNavBarFixed} />
            <Sentry.ErrorBoundary fallback={<></>}>
                <SourceCodeDrawer />
            </Sentry.ErrorBoundary>
            <Outlet />
        </>
    );
};

export default ProjectLayout;
