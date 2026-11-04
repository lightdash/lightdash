import {
    type ApiError,
    type ApiGithubDbtWriteBack,
    type VizColumn,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

type CreatePrParams = {
    projectUuid: string;
    name: string;
    sql: string;
    columns: VizColumn[];
};

const createPullRequest = async (
    lightdashApi: LightdashApi,
    { projectUuid, name, sql, columns }: CreatePrParams,
) =>
    lightdashApi<ApiGithubDbtWriteBack['results']>({
        url: `/projects/${projectUuid}/sqlRunner/pull-request`,
        method: 'POST',
        body: JSON.stringify({ name, sql, columns }),
    });

/**
 * Creates a pull request from SQL runner
 * This hook is used to create a pull request with the SQL query and columns from the SQL runner
 */
export const useGithubDbtWriteBack = () => {
    const lightdashApi = useLightdashApi();
    const { showToastError } = useToaster();

    return useMutation<
        ApiGithubDbtWriteBack['results'],
        ApiError,
        CreatePrParams
    >((args: CreatePrParams) => createPullRequest(lightdashApi, args), {
        mutationKey: ['sqlRunner', 'createPullRequest'],
        onSuccess: (data) => {
            window.open(data.prUrl, '_blank', 'noopener,noreferrer');
        },
        onError: (e) => {
            showToastError({
                title: 'Failed to create a pull request',
                subtitle: e.error.message,
            });
        },
    });
};
