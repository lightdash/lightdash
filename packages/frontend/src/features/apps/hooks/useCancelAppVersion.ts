import { type ApiError } from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type CancelAppVersionParams = {
    projectUuid: string;
    appUuid: string;
    version: number;
};

const cancelAppVersion = async ({
    projectUuid,
    appUuid,
    version,
}: CancelAppVersionParams): Promise<undefined> => {
    await lightdashApi<undefined>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/versions/${version}/cancel`,
        body: undefined,
    });
    return undefined;
};

export const useCancelAppVersion = () =>
    useMutation<undefined, ApiError, CancelAppVersionParams>({
        mutationFn: cancelAppVersion,
    });
