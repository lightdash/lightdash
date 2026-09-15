import { createContext, useContext } from 'react';

export const NavBarPortalContext = createContext('#navbar-header');

export const useNavBarPortalTarget = () => useContext(NavBarPortalContext);
