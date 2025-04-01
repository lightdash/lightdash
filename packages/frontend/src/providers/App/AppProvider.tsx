import { Drawer } from '@mantine/core';
import { useState, type FC } from 'react';
import useHealth from '../../hooks/health/useHealth';
import useUser from '../../hooks/user/useUser';
import AppProviderContext from './context';

const AppProvider: FC<React.PropsWithChildren<{}>> = ({ children }) => {
    const health = useHealth();
    const user = useUser(!!health?.data?.isAuthenticated);
    const [isSupportDrawerOpen, setIsSupportDrawerOpen] = useState(false);

    const value = {
        health,
        user,
        isSupportDrawerOpen,
        setIsSupportDrawerOpen,
    };

    return (
        <AppProviderContext.Provider value={value}>
            {children}
            <Drawer
                opened={isSupportDrawerOpen}
                onClose={() => setIsSupportDrawerOpen(false)}
                title="Share with support"
                position="right"
                size="md"
            >
                moo
            </Drawer>
        </AppProviderContext.Provider>
    );
};

export default AppProvider;
