import { useContext } from 'react';
import { AbilityContext } from '.';

export function useAbilityContext() {
    const context = useContext(AbilityContext);
    if (context === undefined) {
        throw new Error(
            'useAbilityContext must be used within a AbilityContext.Provider',
        );
    }
    return context;
}
