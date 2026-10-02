import {
    type ApiError,
    type ApiGenerativeUiOperationsResponse,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../../../api';

/** The operations cards may call; fixed per deploy, so fetched once. */
export const useGenerativeUiOperations = ({ enabled }: { enabled: boolean }) =>
    useQuery<ApiGenerativeUiOperationsResponse['results'], ApiError>({
        queryKey: ['generativeUi', 'operations'],
        queryFn: () =>
            lightdashApi<ApiGenerativeUiOperationsResponse['results']>({
                url: '/ai/generative-ui/operations',
                method: 'GET',
                body: undefined,
            }),
        staleTime: Infinity,
        enabled,
    });
