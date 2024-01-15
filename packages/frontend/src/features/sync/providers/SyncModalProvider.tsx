import {
    createContext,
    Dispatch,
    FC,
    SetStateAction,
    useContext,
    useState,
} from 'react';

export enum SyncModalAction {
    CREATE = 'create',
    EDIT = 'edit',
    VIEW = 'view',
    DELETE = 'delete',
}

const SyncModalContext = createContext<
    | {
          action: SyncModalAction;
          setAction: Dispatch<SetStateAction<SyncModalAction>>;
          currentSchedulerUuid?: string;
          setCurrentSchedulerUuid: Dispatch<SetStateAction<string | undefined>>;
      }
    | undefined
>(undefined);

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

export const useSyncModal = () => {
    const context = useContext(SyncModalContext);
    if (!context) {
        throw new Error(
            'useSyncWithGoogleSheets must be used within a SyncModalProvider',
        );
    }
    return context;
};
