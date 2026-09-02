import {
    createContext,
    useContext,
    type FC,
    type PropsWithChildren,
} from 'react';
import { type ScopeSource } from './types';

const ScopeSourceContext = createContext<ScopeSource | null>(null);

export const LearnUiProvider: FC<
    PropsWithChildren<{ scopeSource: ScopeSource }>
> = ({ scopeSource, children }) => (
    <ScopeSourceContext.Provider value={scopeSource}>
        {children}
    </ScopeSourceContext.Provider>
);

// eslint-disable-next-line react/only-export-components -- hook co-located with its provider
export const useScopeSource = (): ScopeSource => {
    const source = useContext(ScopeSourceContext);
    if (source === null) {
        throw new Error('useScopeSource must be used inside <LearnUiProvider>');
    }
    return source;
};
