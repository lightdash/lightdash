import { createContext, useContext } from 'react';

type AuthPanelContextValue = {
    flashError: () => void;
};

export const AuthPanelContext = createContext<AuthPanelContextValue>({
    flashError: () => {},
});

export const useAuthPanel = () => useContext(AuthPanelContext);
