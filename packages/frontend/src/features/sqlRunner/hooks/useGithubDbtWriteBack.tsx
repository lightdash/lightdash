import {
    type ApiError,
    type ApiGithubDbtWriteBack,
    type VizColumn,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

type CreatePrParams = {
    projectUuid: string;
    name: string;
    sql: string;
    columns: VizColumn[];
};

const createPullRequest = async ({
    projectUuid,
    name,
    sql,
    columns,
}: CreatePrParams) =>
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
    const { showToastError } = useToaster();

    return useMutation<
        ApiGithubDbtWriteBack['results'],
        ApiError,
        CreatePrParams
    >(createPullRequest, {
        mutationKey: ['sqlRunner', 'createPullRequest'],
        onSuccess: (data) => {
            window.open(data.prUrl, '_blank');
        },
        onError: (e) => {
            showToastError({
                title: 'Failed to create a pull request',
                subtitle: e.error.message,
            });
        },
    });
};
