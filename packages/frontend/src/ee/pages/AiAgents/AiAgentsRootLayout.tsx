import { useMediaQuery } from '@mantine-8/hooks';
import { Provider } from 'react-redux';
import { Outlet } from 'react-router';
import NavBar from '../../../components/NavBar';
import { MobileNavBar } from '../../../MobileRoutes';
import { store } from '../../features/aiCopilot/store';
import { AiAgentThreadStreamAbortControllerContextProvider } from '../../features/aiCopilot/streaming/AiAgentThreadStreamAbortControllerContextProvider';

export const AiAgentsRootLayout = () => {
    const isMobile = useMediaQuery('(max-width: 768px)');
    return (
        <>
            {isMobile ? <MobileNavBar /> : <NavBar />}
            <Provider store={store}>
                <AiAgentThreadStreamAbortControllerContextProvider>
                    <Outlet />
                </AiAgentThreadStreamAbortControllerContextProvider>
            </Provider>
        </>
    );
};
