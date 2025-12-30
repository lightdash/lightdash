import { createContext, type Dispatch, type SetStateAction } from 'react';
import { type SyncFormConfig, type SyncModalAction } from './types';

export interface SyncModalContextValue {
    action: SyncModalAction;
    setAction: Dispatch<SetStateAction<SyncModalAction>>;
    currentSchedulerUuid?: string;
    setCurrentSchedulerUuid: Dispatch<SetStateAction<string | undefined>>;
    /** Form configuration for external rendering of submit button */
    formConfig: SyncFormConfig | null;
    setFormConfig: Dispatch<SetStateAction<SyncFormConfig | null>>;
    /** Delete operation loading state */
    isDeleting: boolean;
    setIsDeleting: Dispatch<SetStateAction<boolean>>;
}

const SyncModalContext = createContext<SyncModalContextValue | undefined>(
    undefined,
);

export default SyncModalContext;
