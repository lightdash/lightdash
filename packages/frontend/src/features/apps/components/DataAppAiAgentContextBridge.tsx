import { useEffect, type FC } from 'react';
import { setCurrentDataApp } from '../../../ee/features/aiCopilot/store/aiAgentLauncherSlice';
import { useAiAgentStoreDispatch } from '../../../ee/features/aiCopilot/store/hooks';

type Props = {
    projectUuid: string;
    appUuid: string;
};

// Tells the AI launcher which data app page is open so new threads pin it.
const DataAppAiAgentContextBridge: FC<Props> = ({ projectUuid, appUuid }) => {
    const dispatch = useAiAgentStoreDispatch();

    useEffect(() => {
        dispatch(setCurrentDataApp({ projectUuid, uuid: appUuid }));
        return () => {
            dispatch(setCurrentDataApp(null));
        };
    }, [dispatch, projectUuid, appUuid]);

    return null;
};

export default DataAppAiAgentContextBridge;
