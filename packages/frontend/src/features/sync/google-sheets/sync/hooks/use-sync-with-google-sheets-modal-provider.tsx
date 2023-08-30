import {
    createContext,
    Dispatch,
    FC,
    SetStateAction,
    useContext,
    useState,
} from 'react';

export enum SyncWithGoogleSheetsModalAction {
    CREATE = 'create',
    EDIT = 'edit',
    VIEW = 'view',
    // TODO: add delete action
}

const SyncWithGoogleSheetsModalContext = createContext<
    | {
          action: SyncWithGoogleSheetsModalAction;
          setAction: Dispatch<SetStateAction<SyncWithGoogleSheetsModalAction>>;
          currentSchedulerUuid?: string;
          setCurrentSchedulerUuid: Dispatch<SetStateAction<string | undefined>>;
      }
    | undefined
>(undefined);

export const SyncWithGoogleSheetsModalProvider: FC = ({ children }) => {
    const [action, setAction] = useState<SyncWithGoogleSheetsModalAction>(
        SyncWithGoogleSheetsModalAction.VIEW,
    );
    const [currentSchedulerUuid, setCurrentSchedulerUuid] = useState<string>();

    return (
        <SyncWithGoogleSheetsModalContext.Provider
            value={{
                action,
                setAction,
                currentSchedulerUuid,
                setCurrentSchedulerUuid,
            }}
        >
            {children}
        </SyncWithGoogleSheetsModalContext.Provider>
    );
};

export const useSyncWithGoogleSheetsModal = () => {
    const context = useContext(SyncWithGoogleSheetsModalContext);
    if (!context) {
        throw new Error(
            'useSyncWithGoogleSheets must be used within a SyncWithGoogleSheetsModalProvider',
        );
    }
    return context;
};
