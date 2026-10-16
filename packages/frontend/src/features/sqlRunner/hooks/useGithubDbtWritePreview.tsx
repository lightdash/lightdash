import {
    type ApiError,
    type ApiGithubDbtWritePreview,
    type VizColumn,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
    lightdashApi<ApiGithubDbtWritePreview['results']>({
        url: `/projects/${projectUuid}/sqlRunner/preview`,
        method: 'POST',
        body: JSON.stringify({ name, sql, columns }),
    });

/**
 * Preview the content of a Pull request from SQL runner
 * This hook is used to get the preview (files and repo) of a pull request with the SQL query and columns from the SQL runner
 */
export const useGithubDbtWritePreview = () => {
    const { t } = useTranslation('sqlRunner');
    const { showToastError } = useToaster();

    return useMutation<
        ApiGithubDbtWritePreview['results'],
        ApiError,
        CreatePrParams
    >(createPullRequest, {
        mutationKey: ['sqlRunner', 'githubDbtWritePreview'],

        onError: (error) => {
            showToastError({
                title: t('toasts.writePreviewFailed'),
                subtitle: error.error.message,
            });
        },
    });
};
