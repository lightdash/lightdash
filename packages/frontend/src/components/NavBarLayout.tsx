import { type FC } from 'react';
import { Outlet } from 'react-router';
import { AppNavigationShell } from './AppSidebar/AppNavigationShell';

export const NavBarLayout: FC = () => (
    <AppNavigationShell isNavBarFixed>
        <Outlet />
    </AppNavigationShell>
);
