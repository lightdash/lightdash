import {
    createContext,
    useContext,
    useMemo,
    type FC,
    type PropsWithChildren,
} from 'react';
import { createLearnModel, type LearnModel } from '../model/learnModel';
import { type ScopeSource } from './types';

type LearnUiContextValue = { scopeSource: ScopeSource; model: LearnModel };
const LearnUiContext = createContext<LearnUiContextValue | null>(null);

export const LearnUiProvider: FC<
    PropsWithChildren<{ scopeSource: ScopeSource }>
> = ({ scopeSource, children }) => {
    const value = useMemo(
        () => ({ scopeSource, model: createLearnModel(scopeSource) }),
        [scopeSource],
    );
    return (
        <LearnUiContext.Provider value={value}>
            {children}
        </LearnUiContext.Provider>
    );
};

const useLearnUi = (hook: string): LearnUiContextValue => {
    const value = useContext(LearnUiContext);
    if (value === null)
        throw new Error(`${hook} must be used inside <LearnUiProvider>`);
    return value;
};

// eslint-disable-next-line react/only-export-components -- hook co-located with its provider
export const useScopeSource = (): ScopeSource =>
    useLearnUi('useScopeSource').scopeSource;
// eslint-disable-next-line react/only-export-components -- hook co-located with its provider
export const useLearnModel = (): LearnModel =>
    useLearnUi('useLearnModel').model;
