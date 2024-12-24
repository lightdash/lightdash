import { type FC } from 'react';
import Context, { type ProjectFormContext } from './context';

export const ProjectFormProvider: FC<
    React.PropsWithChildren<ProjectFormContext>
> = ({ savedProject, children }) => {
    return (
        <Context.Provider value={{ savedProject }}>{children}</Context.Provider>
    );
};
