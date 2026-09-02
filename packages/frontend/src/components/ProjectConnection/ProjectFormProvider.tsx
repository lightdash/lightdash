import { type FC } from 'react';
import Context, { type ProjectFormContext } from './context';

export const ProjectFormProvider: FC<
    React.PropsWithChildren<ProjectFormContext>
> = ({ savedProject, isDbtSource, projectUuid, children }) => {
    return (
        <Context.Provider value={{ savedProject, isDbtSource, projectUuid }}>
            {children}
        </Context.Provider>
    );
};
