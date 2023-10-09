import { Ability } from '@casl/ability';
import { createContextualCan } from '@casl/react';
import { createContext, useContext } from 'react';

export const AbilityContext = createContext(new Ability());
export const Can = createContextualCan(AbilityContext.Consumer);

export function useAbilityContext() {
    const context = useContext(AbilityContext);
    if (context === undefined) {
        throw new Error(
            'useAbilityContext must be used within a AbilityContext.Provider',
        );
    }
    return context;
}
