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

// Secrets stripped from the GET response are merged back server-side before
// the project is persisted.
export const updateProjectWarehouseConnection = async (
    project: Pick<
        Project,
        'projectUuid' | 'name' | 'dbtConnection' | 'dbtVersion'
    >,
    credentials: CreateWarehouseCredentials,
    jobLabel: string,
): Promise<void> => {
    const updateBody: UpdateProject = {
        name: project.name,
        dbtConnection: project.dbtConnection,
        dbtVersion: project.dbtVersion,
        warehouseConnection: credentials,
    };
    const result = await lightdashApi<ApiJobStartedResults>({
        method: 'PATCH',
        url: `/api/v1/projects/${project.projectUuid}`,
        body: JSON.stringify(updateBody),
    });
    await getFinalJobState(result.jobUuid, jobLabel);
};
