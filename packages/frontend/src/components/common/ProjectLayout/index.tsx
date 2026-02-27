import * as Sentry from '@sentry/react';
import { type FC } from 'react';
import { Outlet } from 'react-router';
import SourceCodeDrawer from '../../../features/sourceCodeEditor/components/SourceCodeDrawer';
import NavBar from '../../NavBar';

/**
 * Layout component for all /projects/:projectUuid/* routes.
 *
 * Renders NavBar and SourceCodeDrawer in the correct order, ensuring
 * the drawer renders after NavBar has mounted (fixing visual glitches).
 *
 * The SourceCodeDrawer is wrapped in an ErrorBoundary with null fallback
 * so that drawer errors don't break the rest of the app.
 */
const ProjectLayout: FC = () => {
    return (
        <>
            <NavBar />
            <Sentry.ErrorBoundary fallback={<></>}>
                <SourceCodeDrawer />
            </Sentry.ErrorBoundary>
            <Outlet />
        </>
    );
};

export default ProjectLayout;
