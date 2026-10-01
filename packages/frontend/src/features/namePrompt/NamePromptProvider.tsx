import { useCallback, useMemo, useState, type FC, type ReactNode } from 'react';
import useApp from '../../providers/App/useApp';
import { type NamePromptTrigger } from '../../providers/Tracking/types';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { NamePromptContext } from './context';
import { rememberNamePromptSkipped } from './namePrompt';
import { NamePromptModal } from './NamePromptModal';

type PendingPrompt = { trigger: NamePromptTrigger; action: () => void };

export const NamePromptProvider: FC<{ children: ReactNode }> = ({
    children,
}) => {
    const { user } = useApp();
    const { track } = useTracking();
    const [pending, setPending] = useState<PendingPrompt | null>(null);
    const currentUser = user.data;

    const trackPrompt = useCallback(
        (
            name:
                | EventName.NAME_PROMPT_SHOWN
                | EventName.NAME_PROMPT_SAVED
                | EventName.NAME_PROMPT_SKIPPED,
            trigger: NamePromptTrigger,
        ) => {
            if (!currentUser?.organizationUuid) return;
            track({
                name,
                properties: {
                    organizationId: currentUser.organizationUuid,
                    trigger,
                },
            });
        },
        [currentUser?.organizationUuid, track],
    );

    const prompt = useCallback(
        (trigger: NamePromptTrigger, action: () => void) => {
            trackPrompt(EventName.NAME_PROMPT_SHOWN, trigger);
            setPending({ trigger, action });
        },
        [trackPrompt],
    );

    const value = useMemo(() => ({ prompt }), [prompt]);

    const finish = (
        event: EventName.NAME_PROMPT_SAVED | EventName.NAME_PROMPT_SKIPPED,
    ) => {
        if (!pending) return;
        setPending(null);
        trackPrompt(event, pending.trigger);
        if (event === EventName.NAME_PROMPT_SKIPPED && currentUser) {
            rememberNamePromptSkipped(
                window.localStorage,
                currentUser.userUuid,
            );
        }
        pending.action();
    };

    return (
        <NamePromptContext.Provider value={value}>
            {children}
            {pending && currentUser && (
                <NamePromptModal
                    trigger={pending.trigger}
                    firstName={currentUser.firstName}
                    lastName={currentUser.lastName}
                    onSaved={() => finish(EventName.NAME_PROMPT_SAVED)}
                    onSkip={() => finish(EventName.NAME_PROMPT_SKIPPED)}
                />
            )}
        </NamePromptContext.Provider>
    );
};
