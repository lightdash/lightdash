import { type ProjectGroupAccess } from '@lightdash/common';
import { type LightdashApi } from '../../../api';

export function getProjectGroupAccessList(
    lightdashApi: LightdashApi,
    projectUuid: string,
) {
    return lightdashApi<ProjectGroupAccess[]>({
        url: `/projects/${projectUuid}/groupAccesses`,
        method: 'GET',
        body: undefined,
    });
}
