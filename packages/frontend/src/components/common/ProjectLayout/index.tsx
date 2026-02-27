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
 * Reads `handle.navBarFixed` from the deepest matching route to determine
 * whether NavBar should be fixed (default) or non-fixed (e.g. dashboard views).
 *
 * The SourceCodeDrawer is wrapped in an ErrorBoundary with null fallback
 * so that drawer errors don't break the rest of the app.
 */
const ProjectLayout: FC = () => {
    const matches = useMatches();
    const handle = matches[matches.length - 1]?.handle as
        | { navBarFixed?: boolean }
        | undefined;
    const isNavBarFixed = handle?.navBarFixed !== false;

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
