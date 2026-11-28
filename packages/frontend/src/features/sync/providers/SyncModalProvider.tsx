import { useState, type FC } from 'react';
import SyncModalContext from './context';
import { SyncModalAction } from './types';

export const SyncModalProvider: FC<
    React.PropsWithChildren<{ initialSchedulerUuid?: string }>
> = ({ children, initialSchedulerUuid }) => {
    const [action, setAction] = useState<SyncModalAction>(
        initialSchedulerUuid ? SyncModalAction.EDIT : SyncModalAction.VIEW,
    );
    const [currentSchedulerUuid, setCurrentSchedulerUuid] =
        useState(initialSchedulerUuid);

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
