import { useMemo, type FC } from 'react';
import Context, { type ProjectFormContext } from './context';

export const ProjectFormProvider: FC<
    React.PropsWithChildren<ProjectFormContext>
> = ({
    savedProject,
    isDbtSource,
    isProjectExtraConnection,
    inheritsPrimaryCredentialRequirement,
    primaryRequiresUserCredentials,
    projectUuid,
    warehouseConnectionUuid,
    dbtSourceWarehouseConnectionUuid,
    revealAfterSignIn,
    children,
}) => {
    const value = useMemo(
        () => ({
            savedProject,
            isDbtSource,
            isProjectExtraConnection,
            inheritsPrimaryCredentialRequirement,
            primaryRequiresUserCredentials,
            projectUuid,
            warehouseConnectionUuid,
            dbtSourceWarehouseConnectionUuid,
            revealAfterSignIn,
        }),
        [
            savedProject,
            isDbtSource,
            isProjectExtraConnection,
            inheritsPrimaryCredentialRequirement,
            primaryRequiresUserCredentials,
            projectUuid,
            warehouseConnectionUuid,
            dbtSourceWarehouseConnectionUuid,
            revealAfterSignIn,
        ],
    );
    return <Context.Provider value={value}>{children}</Context.Provider>;
};
