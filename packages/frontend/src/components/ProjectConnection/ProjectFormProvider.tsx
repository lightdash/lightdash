import { useMemo, type FC } from 'react';
import Context, { type ProjectFormContext } from './context';

export const ProjectFormProvider: FC<
    React.PropsWithChildren<ProjectFormContext>
> = ({
    savedProject,
    isDbtSource,
    isProjectExtraConnection,
    projectUuid,
    children,
}) => {
    const value = useMemo(
        () => ({
            savedProject,
            isDbtSource,
            isProjectExtraConnection,
            projectUuid,
        }),
        [savedProject, isDbtSource, isProjectExtraConnection, projectUuid],
    );
    return <Context.Provider value={value}>{children}</Context.Provider>;
};
