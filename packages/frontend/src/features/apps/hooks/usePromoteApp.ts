import {
    type ApiError,
    type ApiPromoteAppDiffResponse,
    type ApiPromoteAppResponse,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

type PromoteAppParams = {
    projectUuid: string;
    appUuid: string;
};

type PromoteAppDiff = ApiPromoteAppDiffResponse['results'];
type PromoteAppResult = ApiPromoteAppResponse['results'];

const getPromoteAppDiff = ({ projectUuid, appUuid }: PromoteAppParams) =>
    lightdashApi<PromoteAppDiff>({
        method: 'GET',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/promoteDiff`,
        body: undefined,
    });

export const usePromoteAppDiff = (
    params: PromoteAppParams | undefined,
    { enabled }: { enabled: boolean },
) =>
    useQuery<PromoteAppDiff, ApiError>({
        queryKey: ['appPromoteDiff', params?.projectUuid, params?.appUuid],
        queryFn: () => getPromoteAppDiff(params!),
        enabled: enabled && !!params,
    });

const promoteApp = ({ projectUuid, appUuid }: PromoteAppParams) =>
    lightdashApi<PromoteAppResult>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/promote`,
        body: undefined,
    });

export const usePromoteApp = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<PromoteAppResult, ApiError, PromoteAppParams>({
        mutationFn: promoteApp,
        onSuccess: (result) => {
            void queryClient.invalidateQueries({ queryKey: ['myApps'] });
            void queryClient.invalidateQueries({ queryKey: ['content'] });
            showToastSuccess({
                title:
                    result.action === 'update'
                        ? 'Data app updated in production'
                        : 'Data app promoted to production',
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to promote app',
                apiError: error,
            });
        },
    });
};
