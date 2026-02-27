import * as Sentry from '@sentry/react';
import { type FC } from 'react';
import { Outlet } from 'react-router';
import SourceCodeDrawer from '../../../features/sourceCodeEditor/components/SourceCodeDrawer';
import NavBar from '../../NavBar';

/**
 * Layout component for dashboard view routes.
 *
 * Same as ProjectLayout but with NavBar isFixed={false} for dashboard pages.
 */
const DashboardLayout: FC = () => {
    return (
        <>
            <NavBar isFixed={false} />
            <Sentry.ErrorBoundary fallback={<></>}>
                <SourceCodeDrawer />
            </Sentry.ErrorBoundary>
            <Outlet />
        </>
    );
};

export default DashboardLayout;
