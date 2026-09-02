import {
    FeatureFlags,
    type ApiDataAppTemplateImportResponse,
    type ApiError,
    type DataAppTemplateImportResult,
    type SaveAppAsTemplateRequest,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import { ORG_DATA_APP_TEMPLATES_QUERY_KEY } from './useOrgDataAppTemplates';

const saveAppAsTemplateApi = async (request: SaveAppAsTemplateRequest) =>
    lightdashApi<ApiDataAppTemplateImportResponse['results']>({
        url: '/org/data-app-templates/from-app',
        method: 'POST',
        body: JSON.stringify(request),
    });

/**
 * Whether the current user can publish templates from the UI: the
 * templates feature is on and they hold create:DataAppTemplate.
 */
export const useCanSaveAppAsTemplate = (): boolean => {
    const flag = useServerFeatureFlag(FeatureFlags.EnableDataAppTemplates);
    const { user } = useApp();
    return (
        flag.data?.enabled === true &&
        (user.data?.ability.can('create', 'DataAppTemplate') ?? false)
    );
};

export const useSaveAppAsTemplate = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        DataAppTemplateImportResult,
        ApiError,
        SaveAppAsTemplateRequest
    >({
        mutationFn: saveAppAsTemplateApi,
        onSuccess: (result) => {
            void queryClient.invalidateQueries({
                queryKey: [ORG_DATA_APP_TEMPLATES_QUERY_KEY],
            });
            showToastSuccess({
                title:
                    result.action === 'created'
                        ? `Template "${result.name}" published`
                        : `Template "${result.name}" updated`,
                subtitle:
                    'It is now in the From Template gallery for your organization.',
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to save app as template',
                apiError: error,
            });
        },
    });
};
