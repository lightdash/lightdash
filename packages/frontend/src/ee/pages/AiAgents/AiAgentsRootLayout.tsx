import * as Sentry from '@sentry/react';
import { Outlet } from 'react-router';
import NavBar from '../../../components/NavBar';
import ScopeTourHost from '../../../features/scopeTours/ScopeTourHost';

const AiAgentsRootLayout = () => {
    return (
        <>
            {/* Static navbar: its z-index stays inert so the in-thread chart
                editor modal can cover it, matching dashboard views. */}
            <NavBar isFixed={false} />
            {/* A walkthrough that clicked into Ask AI continues here. */}
            <Sentry.ErrorBoundary fallback={<></>}>
                <ScopeTourHost />
            </Sentry.ErrorBoundary>
            <Outlet />
        </>
    );
};

export default AiAgentsRootLayout;
