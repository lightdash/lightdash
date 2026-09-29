import { type ApiError } from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import {
    appApiBase,
    type ChartTypeOwner,
} from '../../chartTypes/utils/chartTypeOwner';

type CancelAppVersionParams = {
    projectUuid: string;
    appUuid: string;
    version: number;
    owner: ChartTypeOwner;
};

const cancelAppVersion = async ({
    projectUuid,
    appUuid,
    version,
    owner,
}: CancelAppVersionParams): Promise<undefined> => {
    await lightdashApi<undefined>({
        method: 'POST',
        url: `${appApiBase(owner, projectUuid)}/${appUuid}/versions/${version}/cancel`,
        body: undefined,
    });
    return undefined;
};

export const useCancelAppVersion = () =>
    useMutation<undefined, ApiError, CancelAppVersionParams>({
        mutationFn: cancelAppVersion,
    });
