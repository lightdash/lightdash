import { useMediaQuery } from '@mantine/hooks';
import * as Sentry from '@sentry/react';
import { Outlet } from 'react-router';
import { MobileNavBar } from '../../../components/Mobile/MobileNavBar';
import NavBar from '../../../components/NavBar';
import ScopeTourHost from '../../../features/scopeTours/ScopeTourHost';

const AiAgentsRootLayout = () => {
    const isMobile = useMediaQuery('(max-width: 768px)');
    return (
        <>
            {/* Static navbar: its z-index stays inert so the in-thread chart
                editor modal can cover it, matching dashboard views. */}
            {isMobile ? <MobileNavBar /> : <NavBar isFixed={false} />}
            {/* A walkthrough that clicked into Ask AI continues here. */}
            <Sentry.ErrorBoundary fallback={<></>}>
                <ScopeTourHost />
            </Sentry.ErrorBoundary>
            <Outlet />
        </>
    );
};

export default AiAgentsRootLayout;
