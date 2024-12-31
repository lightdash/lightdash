import { useEffect, type FC } from 'react';
import { useLocation } from 'react-router-dom-v5-compat';
import { useToggle } from 'react-use';
import useHealth from '../../hooks/health/useHealth';
import useUser from '../../hooks/user/useUser';
import AppProviderContext from './context';

const AppProvider: FC<React.PropsWithChildren<{}>> = ({ children }) => {
    const health = useHealth();
    const user = useUser(!!health?.data?.isAuthenticated);
    const [isFullscreen, toggleFullscreen] = useToggle(false);
    const location = useLocation();

    const value = {
        health,
        user,
        isFullscreen,
        toggleFullscreen,
    };

    useEffect(() => {
        toggleFullscreen(false);
    }, [location, toggleFullscreen]);

    return (
        <AppProviderContext.Provider value={value}>
            {children}
        </AppProviderContext.Provider>
    );
};

export default AppProvider;
