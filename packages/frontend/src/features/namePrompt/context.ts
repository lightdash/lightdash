import { createContext } from 'react';
import { type NamePromptTrigger } from '../../providers/Tracking/types';

export type NamePromptContextValue = {
    prompt: (trigger: NamePromptTrigger, onSaved: () => void) => void;
    isPrompting: boolean;
};

export const NamePromptContext = createContext<NamePromptContextValue | null>(
    null,
);
