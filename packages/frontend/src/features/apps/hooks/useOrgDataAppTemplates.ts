import {
    type ApiDataAppTemplatesResponse,
    type ApiError,
    type DataAppTemplateSummary,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

export const ORG_DATA_APP_TEMPLATES_QUERY_KEY = 'org_data_app_templates';

const listOrgDataAppTemplatesApi = async () =>
    lightdashApi<ApiDataAppTemplatesResponse['results']>({
        url: '/org/data-app-templates',
        method: 'GET',
        body: undefined,
    });

/**
 * The organization's uploaded data app templates: what the builder's
 * template gallery offers. Callers pass `enabled` from the feature flag and
 * the create:DataAppFromTemplate grant, so users the gallery does not apply
 * to never hit the endpoint (which would refuse them anyway).
 */
export const useOrgDataAppTemplates = (enabled: boolean) =>
    useQuery<DataAppTemplateSummary[], ApiError>({
        queryKey: [ORG_DATA_APP_TEMPLATES_QUERY_KEY],
        queryFn: listOrgDataAppTemplatesApi,
        enabled,
        staleTime: 60_000,
    });
