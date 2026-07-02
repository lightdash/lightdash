import { type ApiError, type DataAppViz } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getDataAppVisualization = async (
    projectUuid: string,
    dataAppVizUuid: string,
): Promise<DataAppViz> =>
    lightdashApi<DataAppViz>({
        method: 'GET',
        url: `/ee/projects/${projectUuid}/apps/visualizations/${dataAppVizUuid}`,
        body: undefined,
    });

// Fetches a single saved data app viz (incl. its field schema) by id — used by
// the config panel to render one FieldSelect per declared field.
export const useDataAppVisualization = (
    projectUuid: string | undefined,
    dataAppVizUuid: string | undefined,
) =>
    useQuery<DataAppViz, ApiError>({
        queryKey: ['data-app-viz', projectUuid, dataAppVizUuid],
        queryFn: () => getDataAppVisualization(projectUuid!, dataAppVizUuid!),
        enabled: !!projectUuid && !!dataAppVizUuid,
    });
