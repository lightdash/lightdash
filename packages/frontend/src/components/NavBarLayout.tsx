import { type FC } from 'react';
import { Outlet } from 'react-router';
import NavBar from './NavBar';

export const NavBarLayout: FC = () => (
    <>
        <NavBar />
        <Outlet />
    </>
);
