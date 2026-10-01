import { createContext, useContext } from 'react';

type AuthPanelContextValue = {
    startChecking: () => void;
    flashError: () => void;
};

export const AuthPanelContext = createContext<AuthPanelContextValue>({
    startChecking: () => {},
    flashError: () => {},
});

export const useAuthPanel = () => useContext(AuthPanelContext);
