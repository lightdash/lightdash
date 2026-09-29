import {
    type ApiDataAppVizRenderMetadataResponse,
    type ApiError,
    type DataAppVizSchema,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import {
    ORGANIZATION_CHART_TYPES_API_BASE,
    organizationChartTypeSchemaKey,
} from '../utils/chartTypeOwner';

/**
 * An organization chart type's schema at one version, or its latest ready
 * version when `version` is null. Read from its render metadata, since the
 * organization routes have no visualization detail.
 */
export const useOrganizationChartTypeSchema = (
    dataAppVizUuid: string | null,
    version: number | null,
) =>
    useQuery<DataAppVizSchema | null, ApiError>({
        queryKey: [...organizationChartTypeSchemaKey(dataAppVizUuid), version],
        queryFn: async () => {
            const metadata = await lightdashApi<
                ApiDataAppVizRenderMetadataResponse['results']
            >({
                method: 'GET',
                url: `${ORGANIZATION_CHART_TYPES_API_BASE}/${dataAppVizUuid}/render-metadata${
                    version === null ? '' : `?version=${version}`
                }`,
            });
            return metadata.state === 'ready' ? metadata.schema : null;
        },
        enabled: dataAppVizUuid !== null,
        keepPreviousData: dataAppVizUuid !== null,
    });
