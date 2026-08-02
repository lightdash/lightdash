import { useState, type FC, type PropsWithChildren } from 'react';
import {
    CliSsoModeContext,
    SetCliSsoModeContext,
} from './SnowflakeCliSsoModeContext';

export const SnowflakeCliSsoModeProvider: FC<PropsWithChildren> = ({
    children,
}) => {
    const [isCliSsoMode, setIsCliSsoMode] = useState(false);
    return (
        <SetCliSsoModeContext.Provider value={setIsCliSsoMode}>
            <CliSsoModeContext.Provider value={isCliSsoMode}>
                {children}
            </CliSsoModeContext.Provider>
        </SetCliSsoModeContext.Provider>
    );
};
