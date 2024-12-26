import { createContext, type Dispatch, type SetStateAction } from 'react';
import { type SyncModalAction } from './types';

const SyncModalContext = createContext<
    | {
          action: SyncModalAction;
          setAction: Dispatch<SetStateAction<SyncModalAction>>;
          currentSchedulerUuid?: string;
          setCurrentSchedulerUuid: Dispatch<SetStateAction<string | undefined>>;
      }
    | undefined
>(undefined);

export default SyncModalContext;
