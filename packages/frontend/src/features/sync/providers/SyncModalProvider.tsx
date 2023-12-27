import { createContext, Dispatch, FC, SetStateAction, useState } from 'react';
import { SyncModalAction } from '../types';

export const SyncModalContext = createContext<
    | {
          action: SyncModalAction;
          setAction: Dispatch<SetStateAction<SyncModalAction>>;
          currentSchedulerUuid?: string;
          setCurrentSchedulerUuid: Dispatch<SetStateAction<string | undefined>>;
      }
    | undefined
>(undefined);

export const SyncModalProvider: FC = ({ children }) => {
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
