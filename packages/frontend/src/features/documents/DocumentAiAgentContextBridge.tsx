import { useEffect, type FC } from 'react';
import { setCurrentDocument } from '../../ee/features/aiCopilot/store/aiAgentLauncherSlice';
import { useAiAgentStoreDispatch } from '../../ee/features/aiCopilot/store/hooks';

type Props = {
    projectUuid: string;
    documentUuid: string;
};

// Tells the AI launcher which Document page is open so new threads pin it.
const DocumentAiAgentContextBridge: FC<Props> = ({
    projectUuid,
    documentUuid,
}) => {
    const dispatch = useAiAgentStoreDispatch();

    useEffect(() => {
        dispatch(setCurrentDocument({ projectUuid, uuid: documentUuid }));
        return () => {
            dispatch(setCurrentDocument(null));
        };
    }, [dispatch, projectUuid, documentUuid]);

    return null;
};

export default DocumentAiAgentContextBridge;
