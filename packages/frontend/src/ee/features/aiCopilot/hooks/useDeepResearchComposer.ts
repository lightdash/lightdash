import { useCallback, useState } from 'react';
import { type StartDeepResearchArgs } from '../deepResearch/types';

type Args = {
    canStart: boolean;
    onStart?: (args: StartDeepResearchArgs) => Promise<void>;
};

export const useDeepResearchComposer = ({ canStart, onStart }: Args) => {
    const [isStarting, setIsStarting] = useState(false);

    const startDeepResearch = useCallback(
        async (args: StartDeepResearchArgs): Promise<boolean> => {
            if (!onStart || !canStart || isStarting) {
                return false;
            }

            setIsStarting(true);
            try {
                await onStart(args);
                return true;
            } catch {
                // The start mutation owns user-facing error reporting. Keep the
                // prompt in the composer so the user can retry.
                return false;
            } finally {
                setIsStarting(false);
            }
        },
        [canStart, isStarting, onStart],
    );

    return {
        isStarting,
        startDeepResearch,
    };
};
