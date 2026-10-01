import { FeatureFlags } from '@lightdash/common';
import { useCallback, useContext } from 'react';
import useIsEmbedded from '../../ee/providers/Embed/useIsEmbedded';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import { type NamePromptTrigger } from '../../providers/Tracking/types';
import { NamePromptContext } from './context';
import { hasSkippedNamePrompt, isNameMissing } from './namePrompt';

export const useNamePrompt = (trigger: NamePromptTrigger) => {
    const context = useContext(NamePromptContext);
    const { user } = useApp();
    const isEmbedded = useIsEmbedded();
    const connectJourneyFlag = useServerFeatureFlag(
        FeatureFlags.ConnectJourney,
    );
    const currentUser = user.data;
    const shouldAsk =
        context !== null &&
        connectJourneyFlag.data?.enabled === true &&
        !isEmbedded &&
        !!currentUser &&
        isNameMissing(currentUser) &&
        !hasSkippedNamePrompt(window.localStorage, currentUser.userUuid);

    const withName = useCallback(
        (action: () => void) => {
            if (!shouldAsk || !context) {
                action();
                return;
            }
            context.prompt(trigger, action);
        },
        [context, shouldAsk, trigger],
    );

    return { withName };
};
