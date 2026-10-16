import {
    type ApiError,
    type ApiGithubDbtWriteBack,
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
    const { t } = useTranslation('sqlRunner');
    const { showToastError } = useToaster();

    return useMutation<
        ApiGithubDbtWriteBack['results'],
        ApiError,
        CreatePrParams
    >(createPullRequest, {
        mutationKey: ['sqlRunner', 'createPullRequest'],
        onSuccess: (data) => {
            window.open(data.prUrl, '_blank', 'noopener,noreferrer');
        },
        onError: (e) => {
            showToastError({
                title: t('toasts.createPullRequestFailed'),
                subtitle: e.error.message,
            });
        },
    });
};
