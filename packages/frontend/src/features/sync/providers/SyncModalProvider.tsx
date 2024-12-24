import { useState, type FC } from 'react';
import SyncModalContext from './context';
import { SyncModalAction } from './types';

export const SyncModalProvider: FC<React.PropsWithChildren<{}>> = ({
    children,
}) => {
    const [action, setAction] = useState<SyncModalAction>(SyncModalAction.VIEW);
    const [currentSchedulerUuid, setCurrentSchedulerUuid] = useState<string>();

    return (
        <SyncModalContext.Provider
            value={{
                action,
                setAction,
                currentSchedulerUuid,
                setCurrentSchedulerUuid,
            }}
        >
            {children}
        </SyncModalContext.Provider>
    );
};
