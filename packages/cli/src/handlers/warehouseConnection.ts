import {
    type ApiJobStartedResults,
    type CreateWarehouseCredentials,
    type Project,
    type UpdateProject,
} from '@lightdash/common';
import { lightdashApi } from './dbt/apiClient';
import { getFinalJobState } from './dbt/refresh';

type WarehouseCredentialsSource =
    | { source: 'profiles' }
    | { source: 'organization'; name: string }
    | { source: 'none' };

export const getWarehouseCredentialsSource = (options: {
    organizationCredentials?: string;
    warehouseCredentials?: boolean;
}): WarehouseCredentialsSource => {
    if (options.organizationCredentials) {
        return {
            source: 'organization',
            name: options.organizationCredentials,
        };
    }
    if (options.warehouseCredentials === false) {
        return { source: 'none' };
    }
    return { source: 'profiles' };
};

export const updateProjectWarehouseConnection = async (
    project: Pick<
        Project,
        'projectUuid' | 'name' | 'dbtConnection' | 'dbtVersion'
    >,
    credentials: CreateWarehouseCredentials,
    jobLabel: string,
): Promise<void> => {
    // Build UpdateProject body — preserve existing fields, override warehouseConnection.
    // Note: dbtConnection from GET response may have stripped secrets, but the backend's
    // mergeMissingProjectConfigSecrets fills them back in from the saved project before persisting.
    const updateBody: UpdateProject = {
        name: project.name,
        dbtConnection: project.dbtConnection,
        dbtVersion: project.dbtVersion,
        warehouseConnection: credentials,
    };

    // PATCH project — triggers adaptor test + recompile. CLI-deployed projects
    // (dbtConnection type "none") only run the adaptor test and keep their explores.
    const result = await lightdashApi<ApiJobStartedResults>({
        method: 'PATCH',
        url: `/api/v1/projects/${project.projectUuid}`,
        body: JSON.stringify(updateBody),
    });
    await getFinalJobState(result.jobUuid, jobLabel);
};
