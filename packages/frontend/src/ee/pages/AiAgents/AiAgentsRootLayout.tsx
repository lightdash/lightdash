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
            {isMobile ? <MobileNavBar /> : <NavBar />}
            {/* A walkthrough that clicked into Ask AI continues here. */}
            <Sentry.ErrorBoundary fallback={<></>}>
                <ScopeTourHost />
            </Sentry.ErrorBoundary>
            <Outlet />
        </>
    );
};

export default AiAgentsRootLayout;
