import { type ProjectGroupAccess } from '@lightdash/common';
import { lightdashApi } from '../../../api';

export function getProjectGroupAccessList(projectUuid: string) {
    return lightdashApi<ProjectGroupAccess[]>({
        url: `/projects/${projectUuid}/groupAccesses`,
        method: 'GET',
        body: undefined,
    });
}
