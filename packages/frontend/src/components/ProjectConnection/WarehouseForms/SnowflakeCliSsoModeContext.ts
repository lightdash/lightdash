import { createContext, useContext } from 'react';

export const CliSsoModeContext = createContext(false);
export const SetCliSsoModeContext = createContext<(value: boolean) => void>(
    () => {},
);

export const useSnowflakeCliSsoMode = () => useContext(CliSsoModeContext);
export const useSetSnowflakeCliSsoMode = () => useContext(SetCliSsoModeContext);
