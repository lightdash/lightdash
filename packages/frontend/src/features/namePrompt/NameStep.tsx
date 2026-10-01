import { type FC, type ReactNode } from 'react';
import { type NamePromptTrigger } from '../../providers/Tracking/types';
import { NamePromptModal } from './NamePromptModal';
import { useIsNameNeeded } from './useNamePrompt';

export const NameStep: FC<{
    trigger: NamePromptTrigger;
    opened: boolean;
    onClose: () => void;
    children: ReactNode;
}> = ({ trigger, opened, onClose, children }) => {
    const isNameNeeded = useIsNameNeeded();
    if (opened && isNameNeeded) {
        return <NamePromptModal trigger={trigger} onClose={onClose} />;
    }
    return <>{children}</>;
};
