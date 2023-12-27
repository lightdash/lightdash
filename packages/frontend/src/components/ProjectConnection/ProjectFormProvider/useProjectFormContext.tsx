import { useContext } from 'react';
import { Context, ProjectFormContext } from '.';

export function useProjectFormContext(): ProjectFormContext {
    const context = useContext(Context);
    if (context === undefined) {
        throw new Error(
            'useProjectFormContext must be used within a ProjectFormProvider',
        );
    }
    return context;
}
