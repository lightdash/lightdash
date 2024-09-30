import { type Project } from '@lightdash/common';
import { createContext, useContext, type FC } from 'react';

type ProjectFormContext = {
    savedProject?: Project;
};

const Context = createContext<ProjectFormContext | undefined>(undefined);

export const ProjectFormProvider: FC<
    React.PropsWithChildren<ProjectFormContext>
> = ({ savedProject, children }) => {
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
