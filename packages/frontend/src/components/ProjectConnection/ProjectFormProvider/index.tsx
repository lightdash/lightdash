import { Project } from '@lightdash/common';
import { createContext, FC } from 'react';

export type ProjectFormContext = {
    savedProject?: Project;
};

export const Context = createContext<ProjectFormContext | undefined>(undefined);

export const ProjectFormProvider: FC<ProjectFormContext> = ({
    savedProject,
    children,
}) => {
    return (
        <Context.Provider value={{ savedProject }}>{children}</Context.Provider>
    );
};
