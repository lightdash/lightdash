import { useMediaQuery } from '@mantine/hooks';
import { Outlet } from 'react-router';
import NavBar from '../../../components/NavBar';
import { MobileNavBar } from '../../../MobileRoutes';

const AiAgentsRootLayout = () => {
    const isMobile = useMediaQuery('(max-width: 768px)');
    return (
        <>
            {isMobile ? <MobileNavBar /> : <NavBar />}
            <Outlet />
        </>
    );
};

export default AiAgentsRootLayout;
