import { FeatureFlags } from '@lightdash/common';
import { useCallback, useContext } from 'react';
import useIsEmbedded from '../../ee/providers/Embed/useIsEmbedded';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import { type NamePromptTrigger } from '../../providers/Tracking/types';
import { NamePromptContext } from './context';
import { isNameMissing } from './namePrompt';

export const useIsNameNeeded = (): boolean => {
    const { user } = useApp();
    const isEmbedded = useIsEmbedded();
    const connectJourneyFlag = useServerFeatureFlag(
        FeatureFlags.ConnectJourney,
    );
    return (
        connectJourneyFlag.data?.enabled === true &&
        !isEmbedded &&
        !!user.data &&
        isNameMissing(user.data)
    );
};

export const useNamePrompt = (trigger: NamePromptTrigger) => {
    const context = useContext(NamePromptContext);
    const isNameNeeded = useIsNameNeeded() && context !== null;

    const withName = useCallback(
        (onSaved: () => void) => {
            if (!isNameNeeded || !context) {
                onSaved();
                return;
            }
            context.prompt(trigger, onSaved);
        },
        [context, isNameNeeded, trigger],
    );

    return { isNameNeeded, withName };
};

export const useIsNamePromptOpen = (): boolean =>
    useContext(NamePromptContext)?.isPrompting ?? false;
