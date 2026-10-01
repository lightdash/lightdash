import { createContext } from 'react';
import { type NamePromptTrigger } from '../../providers/Tracking/types';

export type NamePromptContextValue = {
    prompt: (trigger: NamePromptTrigger, action: () => void) => void;
};

export const NamePromptContext = createContext<NamePromptContextValue | null>(
    null,
);
