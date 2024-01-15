import {
    CreateProjectGroupAccess,
    DeleteProjectGroupAccess,
    ProjectGroupAccess,
    UpdateProjectGroupAccess,
} from '@lightdash/common';
import { lightdashApi } from '../../../api';

export function getProjectGroupAccessList(projectUuid: string) {
    return lightdashApi<ProjectGroupAccess[]>({
        url: `/projects/${projectUuid}/groupAccesses`,
        method: 'GET',
        body: undefined,
    });
}

export function addProjectGroupAccess({
    groupUuid,
    projectUuid,
    role,
}: CreateProjectGroupAccess) {
    return lightdashApi<ProjectGroupAccess>({
        url: `/groups/${groupUuid}/projects/${projectUuid}`,
        method: 'POST',
        body: JSON.stringify({ role }),
    });
}

export function updateProjectGroupAccess({
    groupUuid,
    projectUuid,
    role,
}: UpdateProjectGroupAccess) {
    return lightdashApi<ProjectGroupAccess>({
        url: `/groups/${groupUuid}/projects/${projectUuid}`,
        method: 'PATCH',
        body: JSON.stringify({ role }),
    });
}

export function removeProjectGroupAccess({
    groupUuid,
    projectUuid,
}: DeleteProjectGroupAccess) {
    return lightdashApi<null>({
        url: `/groups/${groupUuid}/projects/${projectUuid}`,
        method: 'DELETE',
        body: undefined,
    });
}
