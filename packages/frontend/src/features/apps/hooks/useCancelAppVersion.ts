import { type ApiError } from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

type CancelAppVersionParams = {
    projectUuid: string;
    appUuid: string;
    version: number;
};

const cancelAppVersion = async (
    lightdashApi: LightdashApi,
    { projectUuid, appUuid, version }: CancelAppVersionParams,
): Promise<undefined> => {
    await lightdashApi<undefined>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/versions/${version}/cancel`,
        body: undefined,
    });
    return undefined;
};

export const useCancelAppVersion = () => {
    const lightdashApi = useLightdashApi();
    return useMutation<undefined, ApiError, CancelAppVersionParams>({
        mutationFn: (args: CancelAppVersionParams) =>
            cancelAppVersion(lightdashApi, args),
    });
};
