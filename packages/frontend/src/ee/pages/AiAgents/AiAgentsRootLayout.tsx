import { useMediaQuery } from '@mantine-8/hooks';
import { Outlet } from 'react-router';
import NavBar from '../../../components/NavBar';
import { MobileNavBar } from '../../../MobileRoutes';

export const AiAgentsRootLayout = () => {
    const isMobile = useMediaQuery('(max-width: 768px)');
    return (
        <>
            {isMobile ? <MobileNavBar /> : <NavBar />}
            <Outlet />
        </>
    );
};
