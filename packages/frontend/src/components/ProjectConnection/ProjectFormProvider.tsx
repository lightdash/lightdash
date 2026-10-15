import { useMemo, type FC } from 'react';
import Context, { type ProjectFormContext } from './context';

export const ProjectFormProvider: FC<
    React.PropsWithChildren<ProjectFormContext>
> = ({
    savedProject,
    isDbtSource,
    isProjectExtraConnection,
    primaryRequiresUserCredentials,
    projectUuid,
    warehouseConnectionUuid,
    children,
}) => {
    const value = useMemo(
        () => ({
            savedProject,
            isDbtSource,
            isProjectExtraConnection,
            primaryRequiresUserCredentials,
            projectUuid,
            warehouseConnectionUuid,
        }),
        [
            savedProject,
            isDbtSource,
            isProjectExtraConnection,
            primaryRequiresUserCredentials,
            projectUuid,
            warehouseConnectionUuid,
        ],
    );
    return <Context.Provider value={value}>{children}</Context.Provider>;
};
