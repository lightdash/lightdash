import { useCallback, useMemo, useState, type FC, type ReactNode } from 'react';
import { type NamePromptTrigger } from '../../providers/Tracking/types';
import { NamePromptContext } from './context';
import { NamePromptModal } from './NamePromptModal';

type PendingPrompt = { trigger: NamePromptTrigger; onSaved: () => void };

export const NamePromptProvider: FC<{ children: ReactNode }> = ({
    children,
}) => {
    const [pending, setPending] = useState<PendingPrompt | null>(null);

    const prompt = useCallback(
        (trigger: NamePromptTrigger, onSaved: () => void) =>
            setPending({ trigger, onSaved }),
        [],
    );

    const value = useMemo(
        () => ({ prompt, isPrompting: pending !== null }),
        [prompt, pending],
    );

    return (
        <NamePromptContext.Provider value={value}>
            {children}
            {pending && (
                <NamePromptModal
                    trigger={pending.trigger}
                    onSaved={() => {
                        setPending(null);
                        requestAnimationFrame(pending.onSaved);
                    }}
                    onClose={() => setPending(null)}
                />
            )}
        </NamePromptContext.Provider>
    );
};
