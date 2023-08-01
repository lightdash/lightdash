import { Project } from '@lightdash/common';
import { createContext, FC, useContext } from 'react';

type ProjectFormContext = {
    savedProject?: Project;
};

const Context = createContext<ProjectFormContext | undefined>(undefined);

export const ProjectFormProvider: FC<ProjectFormContext> = ({
    savedProject,
    children,
}) => {
    return (
        <Context.Provider value={{ savedProject }}>{children}</Context.Provider>
    );
};

export function useProjectFormContext(): ProjectFormContext {
    const context = useContext(Context);
    if (context === undefined) {
        throw new Error(
            'useProjectFormContext must be used within a ProjectFormProvider',
        );
    }
    return context;
}
